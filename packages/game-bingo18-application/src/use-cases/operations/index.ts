/**
 * Bingo 18 – Operations Dashboard Use Cases barrel export.
 */

export { AckAlertUseCase } from "./ack-alert";
export type {
  AckAlertInput,
  AckAlertOutput,
  AlertGroup,
  ListAlertsInput,
  ListAlertsOutput,
} from "./dto/alerts.dto";
export type { DrawSelectorItem, GetDrawSelectorOutput } from "./dto/draw-selector.dto";
export type {
  GetLiveEntriesInput,
  GetLiveEntriesOutput,
  LiveEntryBoard,
  LiveEntryItem,
} from "./dto/live-entries.dto";
export type {
  GetOpsSnapshotInput,
  GetOpsSnapshotOutput,
  SnapshotAlertCounts,
  SnapshotThresholds,
} from "./dto/snapshot.dto";
export type {
  GetWinningEntriesInput,
  GetWinningEntriesOutput,
  WinningBoardDetail,
  WinningEntriesSummary,
  WinningEntryItem,
} from "./dto/winning-entries.dto";
export type { EvaluateAlertsInput } from "./evaluate-alerts";
export { evaluateBingo18Alerts } from "./evaluate-alerts";
export type { EvaluateOpsAlertsResult } from "./evaluate-ops-alerts";
export { EvaluateOpsAlertsUseCase } from "./evaluate-ops-alerts";
export { GetDrawSelectorUseCase } from "./get-draw-selector";
export { GetLiveEntriesUseCase } from "./get-live-entries";
export { GetOpsSnapshotUseCase } from "./get-ops-snapshot";
export { GetWinningEntriesUseCase } from "./get-winning-entries";
export { ListAlertsUseCase } from "./list-alerts";
export type { PrizeContext } from "./stats-accumulator";
export { Bingo18DrawStatsAccumulator } from "./stats-accumulator";
export type { SyncBettingStatsResult } from "./sync-betting-stats";
export { SyncBettingStatsUseCase } from "./sync-betting-stats";
