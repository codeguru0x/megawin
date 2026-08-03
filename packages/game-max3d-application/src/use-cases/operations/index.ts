/**
 * Max 3D – Operations Dashboard Use Cases barrel export.
 */

export { GetDrawSelectorUseCase } from "./get-draw-selector";
export { GetLiveEntriesUseCase } from "./get-live-entries";
export { GetWinningEntriesUseCase } from "./get-winning-entries";
export { SyncBettingStatsUseCase } from "./sync-betting-stats";
export type { SyncBettingStatsResult } from "./sync-betting-stats";
export { Max3dDrawStatsAccumulator, toPairKey } from "./stats-accumulator";
export type { PrizeContext } from "./stats-accumulator";
export { evaluateMax3dAlerts } from "./evaluate-alerts";
export type { EvaluateAlertsInput } from "./evaluate-alerts";
export { EvaluateOpsAlertsUseCase } from "./evaluate-ops-alerts";
export type { EvaluateOpsAlertsResult } from "./evaluate-ops-alerts";
export { GetOpsSnapshotUseCase } from "./get-ops-snapshot";
export { ListAlertsUseCase } from "./list-alerts";
export { AckAlertUseCase } from "./ack-alert";

export type {
  GetOpsSnapshotInput,
  GetOpsSnapshotOutput,
  SnapshotAlertCounts,
  SnapshotThresholds,
} from "./dto/snapshot.dto";

export type {
  ListAlertsInput,
  ListAlertsOutput,
  AlertGroup,
  AckAlertInput,
  AckAlertOutput,
} from "./dto/alerts.dto";

export type { GetDrawSelectorOutput, DrawSelectorItem } from "./dto/draw-selector.dto";

export type {
  GetLiveEntriesInput,
  GetLiveEntriesOutput,
  LiveEntryItem,
  LiveEntryBoard,
} from "./dto/live-entries.dto";

export type {
  GetWinningEntriesInput,
  GetWinningEntriesOutput,
  WinningEntryItem,
  WinningEntryBoard,
  WinningEntryTierDetail,
  WinningEntriesSummary,
} from "./dto/winning-entries.dto";
