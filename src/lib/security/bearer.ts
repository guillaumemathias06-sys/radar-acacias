import "server-only";
import crypto from "node:crypto";

/** Compare un en-tête « Authorization: Bearer … » à un secret, en temps constant. */
export function hasValidBearer(header: string | null, secret: string | undefined): boolean {
  if (!secret || !header?.startsWith("Bearer ")) return false;
  const given = Buffer.from(header.slice(7));
  const expected = Buffer.from(secret);
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}
