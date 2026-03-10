/**
 * Mega 6/45 – Settle Use Cases barrel export.
 */

export type {
  MegaDrawResult,
  MegaSettleConfig,
  SettleFinancials,
  SettleContext,
  SettleContextWithFinancials,
} from "./types";

export { PrepareSettleUseCase } from "./prepare-settle";
export type { PrepareSettleInput } from "./prepare-settle";

export { SettleEntriesBatchUseCase } from "./settle-entries";
export type { SettleEntriesBatchResult } from "./settle-entries";

export { CalculateFinancialsUseCase } from "./calculate-financials";

export { BuildReportUseCase } from "./build-report";
export type { BuildReportResult } from "./build-report";

export { FinalizeSettleUseCase } from "./finalize-settle";
export type { FinalizeSettleResult } from "./finalize-settle";

export { PatchJackpotPrizeUseCase } from "./patch-jackpot-prize";
export type { PatchJackpotPrizeResult } from "./patch-jackpot-prize";

export { SyncTicketSummariesUseCase } from "./sync-ticket-summaries";
export type { SyncTicketSummariesResult, DrawSyncInput } from "./sync-ticket-summaries";
