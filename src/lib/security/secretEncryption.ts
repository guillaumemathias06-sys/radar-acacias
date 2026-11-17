import "server-only";
import crypto from "node:crypto";

/**
 * §25/§71 (Digital Operations) — "Chiffrer le secret" / "encrypted at
 * rest". AES-256-GCM with a random IV per encryption (never reused —
 * reusing an IV with GCM breaks its confidentiality guarantee entirely).
 * SECRETS_ENCRYPTION_KEY is Jarvis's own app-level key (generated once,
 * 31/08), not a third-party credential — still handled the same way as
 * every other secret this session: Guillaume adds it to Vercel himself,
 * this code only ever reads it from the environment.
 */
const ALGORITHM = "aes-256-gcm";

function getKey(): Buffer | null {
  const raw = process.env.SECRETS_ENCRYPTION_KEY;
  if (!raw) return null;
  try {
    const key = Buffer.from(raw, "base64");
    return key.length === 32 ? key : null;
  } catch {
    return null;
  }
}

export function isSecretEncryptionConfigured(): boolean {
  return getKey() !== null;
}

/** Returns null (never throws) when the key is missing/malformed — the
 * caller decides how to surface "encryption not configured" (§3-style
 * honesty: never silently store a secret unencrypted as a fallback). */
export function encryptSecret(plaintext: string): string | null {
  const key = getKey();
  if (!key) return null;
  const iv = crypto.randomBytes(12); // 96-bit IV, standard for GCM
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // iv || authTag || ciphertext, single base64 blob — simplest safe
  // format to store in one text column.
  return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

export function decryptSecret(encoded: string): string | null {
  const key = getKey();
  if (!key) return null;
  try {
    const blob = Buffer.from(encoded, "base64");
    const iv = blob.subarray(0, 12);
    const authTag = blob.subarray(12, 28);
    const ciphertext = blob.subarray(28);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString("utf8");
  } catch {
    return null; // wrong key, corrupted data, or tampered ciphertext — never partially decrypt
  }
}
