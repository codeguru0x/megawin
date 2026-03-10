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
export type {
  Lotto535Api,
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
} from "./apis/lotto535";
export type {
  Mega645Api,
  Mega645PlaceBetResponse,
  Mega645CurrentDrawResponse,
  Mega645JackpotResponse,
  Mega645ListTicketsParams,
  Mega645ListTicketsResponse,
  Mega645TicketEntriesResponse,
  Mega645EntryLinesResponse,
  Mega645ListDrawResultsParams,
  Mega645ListDrawResultsResponse,
} from "./apis/mega645";
export type {
  Power655Api,
  Power655PlaceBetResponse,
  Power655CurrentDrawResponse,
  Power655JackpotResponse,
  Power655ListTicketsParams,
  Power655ListTicketsResponse,
  Power655TicketEntriesResponse,
  Power655EntryLinesResponse,
} from "./apis/power655";
export type {
  Max3dApi,
  Max3dPlaceBetResponse,
  Max3dCurrentDrawResponse,
  Max3dListTicketsParams,
  Max3dListTicketsResponse,
  Max3dTicketEntriesResponse,
  Max3dEntryLinesResponse,
} from "./apis/max3d";
export type {
  Max3dproApi,
  Max3dproPlaceBetResponse,
  Max3dproCurrentDrawResponse,
  Max3dproListTicketsParams,
  Max3dproListTicketsResponse,
  Max3dproTicketEntriesResponse,
  Max3dproEntryLinesResponse,
} from "./apis/max3dpro";
export type {
  Bingo18Api,
  Bingo18PlaceBetResponse,
  Bingo18CurrentDrawResponse,
  Bingo18ListTicketsParams,
  Bingo18ListTicketsResponse,
  Bingo18TicketEntriesResponse,
} from "./apis/bingo18";

// ---- Game sub-types (referenced by API responses, needed for docs) ----
export type {
  Bingo18TicketPurchaseInput,
  Bingo18BasicBoard,
  Bingo18SideBet,
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
} from "./max3d";
export { Max3dPlayMode, Max3dPlayType } from "./max3d";
export type {
  Max3dproTicketPurchaseInput,
  Max3dproBoardInput,
  Max3dproGameConfigResponse,
  Max3dproGameRules,
  Max3dproPrizeAmounts,
  Max3dproTenantConfig,
  Max3dproDrawInfo,
  Max3dproTicketSummary,
} from "./max3dpro";
export { Max3dproPlayMode } from "./max3dpro";
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
