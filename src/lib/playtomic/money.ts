/**
 * Sprint 013 (P4) — §62-65 REVENUE INTELLIGENCE. Playtomic's own docs
 * confirm one consistent format for every monetary field on both
 * Bookings (`price`) and Payments (`total`/`subtotal`/`price`):
 * `"amount currency_code"`, e.g. `"25.00 EUR"`. A mechanical,
 * well-defined parse — not a guess — and it fails loud (`null`, never
 * `0` or a guessed currency) on anything that doesn't match.
 */
export interface ParsedMoney {
  amount: number;
  currency: string;
}

const MONEY_PATTERN = /^(-?\d+(?:\.\d+)?)\s+([A-Z]{3})$/;

export function parseMoneyString(raw: string | null | undefined): ParsedMoney | null {
  if (!raw) return null;
  const match = MONEY_PATTERN.exec(raw.trim());
  if (!match) return null;
  const amount = Number(match[1]);
  if (Number.isNaN(amount)) return null;
  return { amount, currency: match[2] };
}
