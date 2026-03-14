/**
 * Bingo 18 – Operations Dashboard Use Cases barrel export.
 */

export { GetDrawSelectorUseCase } from "./get-draw-selector";
export { GetOpsSummaryUseCase } from "./get-ops-summary";
export { GetTenantBreakdownUseCase } from "./get-tenant-breakdown";
export { GetDiceFrequencyUseCase } from "./get-dice-frequency";
export { GetPlayTypeDistributionUseCase } from "./get-playtype-distribution";
export { GetLiveEntriesUseCase } from "./get-live-entries";
export { GetTopCombosUseCase } from "./get-top-combos";
export { GetWinningEntriesUseCase } from "./get-winning-entries";

export type { GetDrawSelectorOutput, DrawSelectorItem } from "./dto/draw-selector.dto";

export type {
  OpsQueryInput,
  OpsSummaryOutput,
  TenantBreakdownOutput,
  TenantBreakdownItem,
  DiceFrequencyOutput,
  DiceFrequencyItem,
  PlayTypeDistributionOutput,
  PlayTypeDistributionItem,
} from "./dto/operations.dto";

export type {
  GetLiveEntriesInput,
  GetLiveEntriesOutput,
  LiveEntryItem,
  LiveEntryBoard,
  LiveEntrySideBet,
} from "./dto/live-entries.dto";

export type { GetTopCombosInput, GetTopCombosOutput, TopComboItem } from "./dto/top-combos.dto";

export type {
  GetWinningEntriesInput,
  GetWinningEntriesOutput,
  WinningEntryItem,
  WinningBoardDetail,
  WinningSideBetDetail,
  WinningEntriesSummary,
} from "./dto/winning-entries.dto";
