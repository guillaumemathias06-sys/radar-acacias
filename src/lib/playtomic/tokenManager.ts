import "server-only";
import { encryptSecret, decryptSecret } from "@/lib/security/secretEncryption";
import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

const OAUTH_TOKEN_URL = "https://thirdparty.playtomic.io/api/v1/oauth/token";
const REFRESH_MARGIN_MS = 5 * 60 * 1000; // §10 — same margin as getCalendarAccessToken

/**
 * Sprint 013 (P0) — §7-11 CONNECTION MODEL / TOKEN MANAGER. §7 says
 * "never persist the Bearer token if unnecessary"; §9-10 say "cache it
 * with expires_at, don't mint a new one before every request." Both
 * are honored the only way possible for a stateless serverless
 * function (no in-process memory survives between invocations): the
 * cached token lives inside the SAME encrypted blob as the credentials
 * that mint it — never a plaintext column, never a separate
 * unencrypted field, and always disposable (if lost, just re-minted).
 */
export interface PlaytomicSecretBlob {
  clientId: string;
  clientSecret: string;
  cachedToken?: string;
  tokenExpiresAt?: string; // ISO
}

export function encryptPlaytomicSecret(blob: PlaytomicSecretBlob): string | null {
  return encryptSecret(JSON.stringify(blob));
}

function decryptPlaytomicSecret(encrypted: string): PlaytomicSecretBlob | null {
  const raw = decryptSecret(encrypted);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PlaytomicSecretBlob;
  } catch {
    return null;
  }
}

interface OAuthTokenResponse {
  token: string;
  token_type: string;
  expires_in: number;
}

async function requestNewToken(clientId: string, clientSecret: string): Promise<{ token: string; expiresAt: string } | { error: string }> {
  try {
    const res = await fetch(OAUTH_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: clientId, secret: clientSecret }),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 401 || res.status === 403) return { error: "Identifiants Playtomic refusés — vérifie le Client ID et le secret." };
    if (!res.ok) return { error: `Playtomic a répondu ${res.status} lors de l'authentification.` };
    const json = (await res.json().catch(() => null)) as OAuthTokenResponse | null;
    if (!json || typeof json.token !== "string" || typeof json.expires_in !== "number") {
      return { error: "Réponse d'authentification Playtomic inattendue." };
    }
    const expiresAt = new Date(Date.now() + json.expires_in * 1000).toISOString();
    return { token: json.token, expiresAt };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Erreur réseau lors de l'authentification Playtomic." };
  }
}

/**
 * Every real Playtomic API call goes through this — same auto-refresh
 * contract as getCalendarAccessToken()/getGmailAccessToken(). §11 — a
 * real auth failure is PERSISTED on the row (status:"error" +
 * last_error), never just returned and forgotten, so System Health
 * reflects it honestly on the next read.
 */
export async function getPlaytomicToken(db: AdminClient, venueId: string): Promise<{ token: string | null; error?: string }> {
  const { data } = await db.from("playtomic_connections").select("id, status, encrypted_secret").eq("venue_id", venueId).maybeSingle();
  if (!data || data.status !== "connected" || !data.encrypted_secret) return { token: null, error: "not_connected" };

  const blob = decryptPlaytomicSecret(data.encrypted_secret);
  if (!blob) return { token: null, error: "decrypt_failed" };

  if (blob.cachedToken && blob.tokenExpiresAt) {
    const expiresInMs = new Date(blob.tokenExpiresAt).getTime() - Date.now();
    if (expiresInMs > REFRESH_MARGIN_MS) return { token: blob.cachedToken };
  }

  const result = await requestNewToken(blob.clientId, blob.clientSecret);
  if ("error" in result) {
    const nowIso = new Date().toISOString();
    await db.from("playtomic_connections").update({ status: "error", last_error: result.error, last_error_at: nowIso }).eq("id", data.id);
    return { token: null, error: result.error };
  }

  const newBlob: PlaytomicSecretBlob = { ...blob, cachedToken: result.token, tokenExpiresAt: result.expiresAt };
  const encrypted = encryptPlaytomicSecret(newBlob);
  if (encrypted) {
    await db.from("playtomic_connections").update({ encrypted_secret: encrypted, last_verified_at: new Date().toISOString() }).eq("id", data.id);
  }
  return { token: result.token };
}

/**
 * Used only by the connect route, before any row exists — mints a
 * token directly from freshly-submitted credentials to test them for
 * real, never touching the database (§26 — test before ever storing).
 */
export async function testPlaytomicCredentials(clientId: string, clientSecret: string): Promise<{ token: string | null; error?: string }> {
  const result = await requestNewToken(clientId, clientSecret);
  if ("error" in result) return { token: null, error: result.error };
  return { token: result.token };
}
