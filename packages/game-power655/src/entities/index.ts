/**
 * Power 6/55 – Entities barrel export.
 *
 * Import: `import { ... } from "@megawin/game-power655/entities"`
 *
 * Chứa tất cả domain types cho game Power 6/55:
 * - Enums: PrizeTier, PlayType, PayoutStatus, RefundStatus, Power655Collections
 * - Types: BonusNumber, LineValue, JackpotConfig, PrizeAmounts, ...
 * - Entities: DrawDoc, TicketDoc, TicketEntryDoc, TicketLineDoc, JackpotCycleDoc, ...
 */

export * from "./enums";
export * from "./types";
export * from "./game-config";
export * from "./global-config";
export * from "./tenant-config";
export * from "./ticket";
export * from "./entry";
export * from "./line";
export * from "./draw";
export * from "./jackpot-cycle";
export * from "./report";
