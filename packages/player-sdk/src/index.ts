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

// ---- Client ----
export { createPlayerClient, type PlayerClient, type PlayerSdkConfig } from "./client";

// ---- Auth types ----
export type { AuthTokens, AuthenticateInput, AuthResult, TokenStorage } from "./auth/types";

// ---- Token management ----
export { TokenManager, MemoryTokenStorage, SessionStorageTokenStorage } from "./auth/token-manager";

// ---- API module interfaces ----
export type { AuthApi } from "./auth/auth-api";
export type { KenoApi } from "./apis/keno";
export type { Lotto535Api } from "./apis/lotto535";
export type { Mega645Api } from "./apis/mega645";
export type { Power655Api } from "./apis/power655";
export type { Max3dApi } from "./apis/max3d";
export type { Max3dproApi } from "./apis/max3dpro";
export type { Bingo18Api } from "./apis/bingo18";

// ---- Game sub-types (referenced by API responses, needed for docs) ----
export type {
  Bingo18TicketPurchaseInput,
  Bingo18BoardInput,
  Bingo18GameConfigResponse,
  Bingo18GameRules,
  Bingo18PrizesConfig,
  Bingo18SingleNumPrizesConfig,
  Bingo18DoubleMatchPrizesConfig,
  Bingo18TripleMatchPrizesConfig,
  Bingo18SumTotalPrizesConfig,
  Bingo18BigSmallDrawPrizesConfig,
  Bingo18TenantConfig,
  Bingo18DrawInfo,
  Bingo18TicketSummary,
  Bingo18DrawPrize,
  Bingo18DrawResultSummary,
  Bingo18DrawResultInfo,
  Bingo18PlaceBetResponse,
  Bingo18CurrentDrawResponse,
  Bingo18ListPendingTicketsParams,
  Bingo18ListAllTicketsParams,
  Bingo18ListTicketsResponse,
  Bingo18TicketEntriesResponse,
  Bingo18ListDrawResultsParams,
  Bingo18ListDrawResultsResponse,
} from "./bingo18";
export { Bingo18TripleKind, Bingo18BigSmallBet } from "./bingo18";
export type {
  Mega645TicketPurchaseInput,
  Mega645BoardInput,
  Mega645SelectionInput,
  Mega645GameConfigResponse,
  Mega645GameRules,
  Mega645PrizeAmounts,
  Mega645JackpotConfigInfo,
  Mega645TenantConfig,
  Mega645DrawInfo,
  Mega645TicketSummary,
  Mega645EntryResult,
  Mega645DrawTierPrize,
  Mega645DrawResultDetail,
  Mega645DrawResultSummary,
  Mega645PlaceBetResponse,
  Mega645CurrentDrawResponse,
  Mega645JackpotResponse,
  Mega645ListPendingTicketsParams,
  Mega645ListAllTicketsParams,
  Mega645ListTicketsResponse,
  Mega645TicketEntriesResponse,
  Mega645EntryLinesResponse,
  Mega645ListDrawResultsParams,
  Mega645ListDrawResultsResponse,
} from "./mega645";
export { Mega645PlayType, Mega645PrizeTier } from "./mega645";
export type {
  Power655TicketPurchaseInput,
  Power655BoardInput,
  Power655SelectionInput,
  Power655GameConfigResponse,
  Power655GameRules,
  Power655PrizeAmounts,
  Power655JackpotConfigInfo,
  Power655TenantConfig,
  Power655DrawInfo,
  Power655TicketSummary,
  Power655EntryResult,
  Power655LineInfo,
  Power655DrawTierPrize,
  Power655DrawResultSummary,
  Power655DrawResultInfo,
  Power655PlaceBetResponse,
  Power655CurrentDrawResponse,
  Power655JackpotResponse,
  Power655ListPendingTicketsParams,
  Power655ListAllTicketsParams,
  Power655ListTicketsResponse,
  Power655TicketEntriesResponse,
  Power655EntryLinesResponse,
  Power655EntryLinesParams,
  Power655ListDrawResultsParams,
  Power655ListDrawResultsResponse,
} from "./power655";
export { Power655PlayType, Power655PrizeTier } from "./power655";
export type {
  Max3dTicketPurchaseInput,
  Max3dBoardInput,
  Max3dGameConfigResponse,
  Max3dGameRules,
  Max3dPrizesConfig,
  Max3dBasicPrizeAmounts,
  Max3dComboPrizeAmounts,
  Max3dPlusPrizeAmounts,
  Max3dTenantConfig,
  Max3dDrawInfo,
  Max3dTicketSummary,
  Max3dLineInfo,
  Max3dDrawTierPrize,
  Max3dDrawResultSummary,
  Max3dDrawResultInfo,
  Max3dPlaceBetResponse,
  Max3dCurrentDrawResponse,
  Max3dListPendingTicketsParams,
  Max3dListAllTicketsParams,
  Max3dListTicketsResponse,
  Max3dTicketEntriesResponse,
  Max3dEntryLinesResponse,
  Max3dEntryLinesParams,
  Max3dListDrawResultsParams,
  Max3dListDrawResultsResponse,
} from "./max3d";
export { Max3dPlayMode, Max3dPlayType } from "./max3d";
export type {
  Max3dproTicketPurchaseInput,
  Max3dproBoardInput,
  Max3dproMultiNumberBoardInput,
  Max3dproMultiDigitBoardInput,
  Max3dproGameConfigResponse,
  Max3dproGameRules,
  Max3dproPrizeAmounts,
  Max3dproTenantConfig,
  Max3dproDrawInfo,
  Max3dproTicketSummary,
  Max3dproLineInfo,
  Max3dproDrawTierPrize,
  Max3dproDrawResultSummary,
  Max3dproDrawResultInfo,
  Max3dproPlaceBetResponse,
  Max3dproCurrentDrawResponse,
  Max3dproListPendingTicketsParams,
  Max3dproListAllTicketsParams,
  Max3dproListTicketsResponse,
  Max3dproTicketEntriesResponse,
  Max3dproEntryLinesResponse,
  Max3dproEntryLinesParams,
  Max3dproListDrawResultsParams,
  Max3dproListDrawResultsResponse,
} from "./max3dpro";
export { Max3dproPlayMode } from "./max3dpro";
export type {
  Lotto535TicketPurchaseInput,
  Lotto535DrawInfo,
  Lotto535TicketSummary,
  Lotto535EntryResult,
  Lotto535GameConfigResponse,
  Lotto535DrawResultDetail,
  Lotto535DrawResultSummary,
  Lotto535PlaceBetResponse,
  Lotto535CurrentDrawResponse,
  Lotto535JackpotResponse,
  Lotto535ListTicketsParams,
  Lotto535ListAllTicketsParams,
  Lotto535ListTicketsResponse,
  Lotto535TicketEntriesResponse,
  Lotto535EntryLinesResponse,
  Lotto535ListDrawResultsParams,
  Lotto535ListDrawResultsResponse,
} from "./lotto535";
export type { PlayerApi, PlayerBalance } from "./apis/player";

// ---- API error types ----
export {
  ApiClientError,
  type ApiResponse,
  type ApiSuccessResponse,
  type ApiErrorResponse,
  type ApiResponseMeta,
  type ApiErrorDetail,
  isApiSuccess,
  isApiError,
} from "./api-types";

// ---- HTTP client types (cho advanced usage) ----
export type { HttpClient, RequestOptions } from "./http-client";
