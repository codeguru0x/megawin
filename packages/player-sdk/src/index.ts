/**
 * @megawin/player-sdk
 *
 * MegaWin Player SDK — thư viện cho đối tác (tenant) tích hợp game client.
 *
 * @example
 * ```ts
 * import { createPlayerClient } from "@megawin/player-sdk";
 * import type { KenoTicketPurchaseInput } from "@megawin/player-sdk/keno";
 * import type { Lotto535TicketPurchaseInput } from "@megawin/player-sdk/lotto535";
 *
 * const client = createPlayerClient({
 *   baseUrl: "https://api.domain.com",
 *   tokens: tokensFromServer,
 * });
 *
 * const balance = await client.player.getBalance();
 * const kenoResult = await client.keno.placeBet({ ... });
 * ```
 *
 * @packageDocumentation
 */

// ---- API error types ----
export {
  ApiClientError,
  type ApiErrorDetail,
  type ApiErrorResponse,
  type ApiResponse,
  type ApiResponseMeta,
  type ApiSuccessResponse,
  isApiError,
  isApiSuccess,
} from "./api-types";
export type { Bingo18Api } from "./apis/bingo18";
export type { KenoApi } from "./apis/keno";
export type { Lotto535Api } from "./apis/lotto535";
export type { Max3dApi } from "./apis/max3d";
export type { Max3dproApi } from "./apis/max3dpro";
export type { Mega645Api } from "./apis/mega645";
export type { PlayerApi, PlayerBalance } from "./apis/player";
export type { Power655Api } from "./apis/power655";
// ---- API module interfaces ----
export type { AuthApi } from "./auth/auth-api";
// ---- Token management ----
export { MemoryTokenStorage, SessionStorageTokenStorage, TokenManager } from "./auth/token-manager";
// ---- Auth types ----
export type { AuthenticateInput, AuthResult, AuthTokens, TokenStorage } from "./auth/types";
// ---- Game sub-types (referenced by API responses, needed for docs) ----
export type {
  Bingo18BigSmallDrawPrizesConfig,
  Bingo18BoardInput,
  Bingo18CurrentDrawResponse,
  Bingo18DoubleMatchPrizesConfig,
  Bingo18DrawInfo,
  Bingo18DrawPrize,
  Bingo18DrawResultInfo,
  Bingo18DrawResultSummary,
  Bingo18GameConfigResponse,
  Bingo18GameRules,
  Bingo18ListAllTicketsParams,
  Bingo18ListDrawResultsParams,
  Bingo18ListDrawResultsResponse,
  Bingo18ListPendingTicketsParams,
  Bingo18ListTicketsResponse,
  Bingo18PlaceBetResponse,
  Bingo18PrizesConfig,
  Bingo18SingleNumPrizesConfig,
  Bingo18SumTotalPrizesConfig,
  Bingo18TenantConfig,
  Bingo18TicketEntriesResponse,
  Bingo18TicketPurchaseInput,
  Bingo18TicketSummary,
  Bingo18TripleMatchPrizesConfig,
} from "./bingo18";
export { Bingo18BigSmallBet, Bingo18TripleKind } from "./bingo18";
// ---- Client ----
export { createPlayerClient, type PlayerClient, type PlayerSdkConfig } from "./client";
// ---- HTTP client types (cho advanced usage) ----
export type { HttpClient, RequestOptions } from "./http-client";
export type {
  Lotto535ComboPopularityParams,
  Lotto535ComboPopularityResponse,
  Lotto535CurrentDrawResponse,
  Lotto535DrawInfo,
  Lotto535DrawResultDetail,
  Lotto535DrawResultSummary,
  Lotto535EntryLinesResponse,
  Lotto535EntryResult,
  Lotto535GameConfigResponse,
  Lotto535JackpotResponse,
  Lotto535ListAllTicketsParams,
  Lotto535ListDrawResultsParams,
  Lotto535ListDrawResultsResponse,
  Lotto535ListTicketsParams,
  Lotto535ListTicketsResponse,
  Lotto535PlaceBetResponse,
  Lotto535TicketEntriesResponse,
  Lotto535TicketPurchaseInput,
  Lotto535TicketSummary,
} from "./lotto535";
export type {
  Max3dBasicPrizeAmounts,
  Max3dBoardInput,
  Max3dComboPrizeAmounts,
  Max3dCurrentDrawResponse,
  Max3dDrawInfo,
  Max3dDrawResultInfo,
  Max3dDrawResultSummary,
  Max3dDrawTierPrize,
  Max3dEntryLinesParams,
  Max3dEntryLinesResponse,
  Max3dGameConfigResponse,
  Max3dGameRules,
  Max3dLineInfo,
  Max3dListAllTicketsParams,
  Max3dListDrawResultsParams,
  Max3dListDrawResultsResponse,
  Max3dListPendingTicketsParams,
  Max3dListTicketsResponse,
  Max3dPlaceBetResponse,
  Max3dPlusPrizeAmounts,
  Max3dPrizesConfig,
  Max3dTenantConfig,
  Max3dTicketEntriesResponse,
  Max3dTicketPurchaseInput,
  Max3dTicketSummary,
} from "./max3d";
export { Max3dPlayMode, Max3dPlayType } from "./max3d";
export type {
  Max3dproBoardInput,
  Max3dproCurrentDrawResponse,
  Max3dproDrawInfo,
  Max3dproDrawResultInfo,
  Max3dproDrawResultSummary,
  Max3dproDrawTierPrize,
  Max3dproEntryLinesParams,
  Max3dproEntryLinesResponse,
  Max3dproGameConfigResponse,
  Max3dproGameRules,
  Max3dproLineInfo,
  Max3dproListAllTicketsParams,
  Max3dproListDrawResultsParams,
  Max3dproListDrawResultsResponse,
  Max3dproListPendingTicketsParams,
  Max3dproListTicketsResponse,
  Max3dproMultiDigitBoardInput,
  Max3dproMultiNumberBoardInput,
  Max3dproPlaceBetResponse,
  Max3dproPrizeAmounts,
  Max3dproTenantConfig,
  Max3dproTicketEntriesResponse,
  Max3dproTicketPurchaseInput,
  Max3dproTicketSummary,
} from "./max3dpro";
export { Max3dproPlayMode } from "./max3dpro";
export type {
  Mega645BoardInput,
  Mega645ComboPopularityParams,
  Mega645ComboPopularityResponse,
  Mega645CurrentDrawResponse,
  Mega645DrawInfo,
  Mega645DrawResultDetail,
  Mega645DrawResultSummary,
  Mega645DrawTierPrize,
  Mega645EntryLinesResponse,
  Mega645EntryResult,
  Mega645GameConfigResponse,
  Mega645GameRules,
  Mega645JackpotConfigInfo,
  Mega645JackpotResponse,
  Mega645ListAllTicketsParams,
  Mega645ListDrawResultsParams,
  Mega645ListDrawResultsResponse,
  Mega645ListPendingTicketsParams,
  Mega645ListTicketsResponse,
  Mega645PlaceBetResponse,
  Mega645PrizeAmounts,
  Mega645SelectionInput,
  Mega645TenantConfig,
  Mega645TicketEntriesResponse,
  Mega645TicketPurchaseInput,
  Mega645TicketSummary,
} from "./mega645";
export { Mega645PlayType, Mega645PrizeTier } from "./mega645";
export type {
  Power655BoardInput,
  Power655ComboPopularityParams,
  Power655ComboPopularityResponse,
  Power655CurrentDrawResponse,
  Power655DrawInfo,
  Power655DrawResultInfo,
  Power655DrawResultSummary,
  Power655DrawTierPrize,
  Power655EntryLinesParams,
  Power655EntryLinesResponse,
  Power655EntryResult,
  Power655GameConfigResponse,
  Power655GameRules,
  Power655JackpotConfigInfo,
  Power655JackpotResponse,
  Power655LineInfo,
  Power655ListAllTicketsParams,
  Power655ListDrawResultsParams,
  Power655ListDrawResultsResponse,
  Power655ListPendingTicketsParams,
  Power655ListTicketsResponse,
  Power655PlaceBetResponse,
  Power655PrizeAmounts,
  Power655SelectionInput,
  Power655TenantConfig,
  Power655TicketEntriesResponse,
  Power655TicketPurchaseInput,
  Power655TicketSummary,
} from "./power655";
export { Power655PlayType, Power655PrizeTier } from "./power655";
