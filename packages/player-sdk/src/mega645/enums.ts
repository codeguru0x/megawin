/**
 * Mega 6/45 SDK – Public Enums
 * @module
 */

export const Mega645PlayType = {
  Standard: "standard",
  Bao5: "bao5",
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

export type Mega645PlayType = (typeof Mega645PlayType)[keyof typeof Mega645PlayType];

export const Mega645PrizeTier = {
  Jackpot: "jackpot",
  Tier1: "tier1",
  Tier2: "tier2",
  Tier3: "tier3",
} as const;

export type Mega645PrizeTier = (typeof Mega645PrizeTier)[keyof typeof Mega645PrizeTier];
