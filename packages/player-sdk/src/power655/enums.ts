/**
 * Power 6/55 SDK – Public Enums
 * @module
 */

export const Power655PlayType = {
  Standard: "standard",
  Bao7: "bao7",
  Bao8: "bao8",
  Bao9: "bao9",
  Bao10: "bao10",
  Bao11: "bao11",
  Bao12: "bao12",
  Bao13: "bao13",
  Bao14: "bao14",
  Bao15: "bao15",
  Bao18: "bao18",
  QuickPick: "quickPick",
} as const;

export type Power655PlayType = (typeof Power655PlayType)[keyof typeof Power655PlayType];

export const Power655PrizeTier = {
  Jackpot1: "jackpot1",
  Jackpot2: "jackpot2",
  Tier1: "tier1",
  Tier2: "tier2",
  Tier3: "tier3",
} as const;

export type Power655PrizeTier = (typeof Power655PrizeTier)[keyof typeof Power655PrizeTier];
