/**
 * Mega 6/45 – Operations Dashboard Use Cases barrel export.
 */

export { AckAlertUseCase } from "./ack-alert";
export type { DrawSelectorItem, GetDrawSelectorOutput } from "./dto/draw-selector.dto";
export type {
  GetLiveEntriesInput,
  GetLiveEntriesOutput,
  LiveEntryBoard,
  LiveEntryItem,
} from "./dto/live-entries.dto";
export type {
  AckAlertInput,
  AckAlertOutput,
  GetComboLookupInput,
  GetComboLookupOutput,
  GetOpsSnapshotInput,
  GetOpsSnapshotOutput,
  ListAlertsInput,
  ListAlertsOutput,
  Mega645AlertGroup,
  Mega645ComboLookupAccount,
  Mega645SnapshotExposure,
  Mega645SnapshotThresholds,
  Mega645TopCombo,
} from "./dto/ops.dto";
export type {
  GetWinningEntriesInput,
  GetWinningEntriesOutput,
  WinningEntriesSummary,
  WinningEntryBoard,
  WinningEntryItem,
  WinningEntryTierDetail,
} from "./dto/winning-entries.dto";
export type { EvaluateAlertsInput } from "./evaluate-alerts";
export { evaluateAlerts } from "./evaluate-alerts";
export type { EvaluateOpsAlertsResult } from "./evaluate-ops-alerts";
export { EvaluateOpsAlertsUseCase } from "./evaluate-ops-alerts";
export { GetComboLookupUseCase } from "./get-combo-lookup";
export { GetDrawSelectorUseCase } from "./get-draw-selector";
export { GetLiveEntriesUseCase } from "./get-live-entries";
// ── p0-03: snapshot / alerts / combo-lookup (đọc pre-aggregated, thay dead-code aggregation) ──
export { GetOpsSnapshotUseCase } from "./get-ops-snapshot";
export { GetWinningEntriesUseCase } from "./get-winning-entries";
export { ListAlertsUseCase } from "./list-alerts";
export type { PrizeContext } from "./stats-accumulator";
// ── p0-02: stats worker use-cases (pure accumulator/evaluator + 2 TickLoopWorker) ──
export { Mega645StatsAccumulator } from "./stats-accumulator";
export type { SyncBettingStatsResult } from "./sync-betting-stats";
export { SyncBettingStatsUseCase } from "./sync-betting-stats";
