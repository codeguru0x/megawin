/**
 * Keno – Operations Dashboard Use Cases barrel export.
 */

export { GetLiveEntriesUseCase } from "./get-live-entries";
export { GetDrawSelectorUseCase } from "./get-draw-selector";
export { GetComboLookupUseCase } from "./get-combo-lookup";
export { GetOpsSnapshotUseCase } from "./get-ops-snapshot";
export { ListAlertsUseCase } from "./list-alerts";
export { AckAlertUseCase } from "./ack-alert";
export { GetWinningEntriesUseCase } from "./get-winning-entries";
export { SyncBettingStatsUseCase, type SyncBettingStatsResult } from "./sync-betting-stats";
export { EvaluateOpsAlertsUseCase, type EvaluateOpsAlertsResult } from "./evaluate-ops-alerts";
export { DrawStatsAccumulator, type PrizeContext } from "./stats-accumulator";

export type {
  GetLiveEntriesInput,
  GetLiveEntriesOutput,
  LiveEntryItem,
  LiveEntryBoard,
} from "./dto/live-entries.dto";

export type { GetDrawSelectorOutput, DrawSelectorItem } from "./dto/draw-selector.dto";

export type {
  GetComboLookupInput,
  GetComboLookupOutput,
  ComboLookupAccount,
} from "./dto/combo-lookup.dto";

export type {
  ListAlertsInput,
  ListAlertsOutput,
  AlertGroup,
  AckAlertInput,
  AckAlertOutput,
} from "./dto/alerts.dto";

export type {
  GetOpsSnapshotInput,
  GetOpsSnapshotOutput,
  SnapshotAlertCounts,
} from "./dto/snapshot.dto";

export type {
  GetWinningEntriesInput,
  GetWinningEntriesOutput,
  WinningEntryItem,
  WinningEntryBoardDetail,
  WinningEntriesSummary,
} from "./dto/winning-entries.dto";
