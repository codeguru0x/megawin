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
 *   baseUrl: "https://api.megawin.com",
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
export type { AuthTokens, AuthenticateInput, AuthResult, TokenStorage } from "./types";

// ---- Token management ----
export { TokenManager, MemoryTokenStorage } from "./token-manager";

// ---- API module interfaces ----
export type { AuthApi } from "./apis/auth";
export type { KenoApi, KenoPlaceBetResponse } from "./apis/keno";
export type { Lotto535Api, Lotto535PlaceBetResponse } from "./apis/lotto535";
export type {
  PlayerApi,
  PlayerBalance,
  GetBetHistoryParams,
  BetHistoryResponse,
  BetHistoryItem,
  GameResult,
} from "./apis/player";

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
