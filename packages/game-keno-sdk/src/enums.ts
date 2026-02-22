/**
 * Keno SDK – Public Enums
 *
 * Chỉ expose enums an toàn cho tenant develop client SDK.
 */

// ─────────────────────────────────────────────
// Play Type
// ─────────────────────────────────────────────

export const KenoPlayType = {
  Pick1: "pick1",
  Pick2: "pick2",
  Pick3: "pick3",
  Pick4: "pick4",
  Pick5: "pick5",
  Pick6: "pick6",
  Pick7: "pick7",
  Pick8: "pick8",
  Pick9: "pick9",
  Pick10: "pick10",
  BigSmall: "bigSmall",
  EvenOdd: "evenOdd",
} as const;

export type KenoPlayType =
  (typeof KenoPlayType)[keyof typeof KenoPlayType];

// ─────────────────────────────────────────────
// Side Bet Selections
// ─────────────────────────────────────────────

export const KenoBigSmallBet = {
  Big: "big",
  BigSmallDraw: "bigSmallDraw",
  Small: "small",
} as const;

export type KenoBigSmallBet =
  (typeof KenoBigSmallBet)[keyof typeof KenoBigSmallBet];

export const KenoEvenOddBet = {
  Even: "even",
  Even1112: "even1112",
  EvenOddDraw: "evenOddDraw",
  Odd1112: "odd1112",
  Odd: "odd",
} as const;

export type KenoEvenOddBet =
  (typeof KenoEvenOddBet)[keyof typeof KenoEvenOddBet];

// ─────────────────────────────────────────────
// Ticket Display Status
// ─────────────────────────────────────────────

export const KenoTicketDisplayStatus = {
  Pending: "pending",
  Active: "active",
  Completed: "completed",
} as const;

export type KenoTicketDisplayStatus =
  (typeof KenoTicketDisplayStatus)[keyof typeof KenoTicketDisplayStatus];

// ─────────────────────────────────────────────
// Currency
// ─────────────────────────────────────────────

export const Currency = { VND: "VND" } as const;
export type Currency = (typeof Currency)[keyof typeof Currency];
