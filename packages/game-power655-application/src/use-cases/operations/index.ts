/**
 * Power 6/55 – Operations Dashboard Use Cases barrel export.
 */

export { GetLiveEntriesUseCase } from "./get-live-entries";
export { GetDrawSelectorUseCase } from "./get-draw-selector";
export { GetWinningEntriesUseCase } from "./get-winning-entries";

// ── p0-03: operations API (snapshot / alerts / combo-lookup) — đọc snapshot pre-aggregated ──
export { GetOpsSnapshotUseCase } from "./get-ops-snapshot";
export { ListAlertsUseCase } from "./list-alerts";
export { AckAlertUseCase } from "./ack-alert";
export { GetComboLookupUseCase } from "./get-combo-lookup";

// ── p0-02: stats worker (accumulator pure + 2 TickLoopWorker) ──
export { Power655StatsAccumulator } from "./stats-accumulator";
export type { PrizeContext } from "./stats-accumulator";
export { SyncBettingStatsUseCase } from "./sync-betting-stats";
export type { SyncBettingStatsResult } from "./sync-betting-stats";
export { evaluateAlerts } from "./evaluate-alerts";
export type { EvaluateAlertsInput } from "./evaluate-alerts";
export { EvaluateOpsAlertsUseCase } from "./evaluate-ops-alerts";
export type { EvaluateOpsAlertsResult } from "./evaluate-ops-alerts";

export type {
  GetLiveEntriesInput,
  GetLiveEntriesOutput,
  LiveEntryItem,
  LiveEntryBoard,
} from "./dto/live-entries.dto";

export type { GetDrawSelectorOutput, DrawSelectorItem } from "./dto/draw-selector.dto";

export type {
  GetWinningEntriesInput,
  GetWinningEntriesOutput,
  WinningEntryItem,
  WinningEntryBoard,
  WinningEntryTierDetail,
  WinningEntriesSummary,
} from "./dto/winning-entries.dto";

export type {
  GetOpsSnapshotInput,
  GetOpsSnapshotOutput,
  Power655TopCombo,
  Power655SnapshotThresholds,
  Power655SnapshotExposure,
  ListAlertsInput,
  ListAlertsOutput,
  Power655AlertGroup,
  AckAlertInput,
  AckAlertOutput,
  GetComboLookupInput,
  GetComboLookupOutput,
  Power655ComboLookupAccount,
} from "./dto/ops.dto";
