/**
 * Max 3D Pro API Module
 * @module
 */

import type { HttpClient } from "../http-client";
import type {
  Max3dproTicketPurchaseInput,
  Max3dproGameConfigResponse,
  Max3dproDrawInfo,
  Max3dproTicketSummary,
} from "../max3dpro";
import { ENDPOINTS } from "../endpoints";

export interface Max3dproListTicketsParams {
  size?: number;
  cursor?: string;
  from?: string;
  to?: string;
}

export interface Max3dproPlaceBetResponse {
  ticketId: string;
  ticketNo: string;
  totalAmount: number;
}

export interface Max3dproCurrentDrawResponse {
  currentDraw: Max3dproDrawInfo | null;
  activeDraws: Max3dproDrawInfo[];
}

export interface Max3dproListTicketsResponse {
  tickets: Max3dproTicketSummary[];
  nextCursor: string | null;
  size: number;
}

export interface Max3dproTicketEntriesResponse {
  ticket: Max3dproTicketSummary;
  entries: Array<{
    id: string;
    drawId: string;
    drawDate: string;
    status: string;
    amount: number;
    result?: {
      firstPrize: string;
      secondPrize: string;
      publishedAt: string;
    };
    outcome?: string;
    payout?: {
      winAmount: number;
      payoutAmount: number;
      boardPayouts: Array<{
        boardNo: string;
        playMode: string;
        playType: string;
        prizeLevel: string;
        matchResult: string;
        winAmount: number;
      }>;
    };
  }>;
}

export interface Max3dproEntryLinesResponse {
  entryId: string;
  lines: Array<{ first: string; second: string }>;
}

export interface Max3dproApi {
  getGameConfig(): Promise<Max3dproGameConfigResponse>;
  getCurrentDraw(): Promise<Max3dproCurrentDrawResponse>;
  placeBet(input: Max3dproTicketPurchaseInput): Promise<Max3dproPlaceBetResponse>;
  listPendingTickets(params?: Max3dproListTicketsParams): Promise<Max3dproListTicketsResponse>;
  listTickets(params?: Max3dproListTicketsParams): Promise<Max3dproListTicketsResponse>;
  getTicketEntries(ticketId: string): Promise<Max3dproTicketEntriesResponse>;
  getEntryLines(entryId: string): Promise<Max3dproEntryLinesResponse>;
}

/** @internal */
export function createMax3dproApi(http: HttpClient): Max3dproApi {
  return {
    async getGameConfig() {
      return http.get<Max3dproGameConfigResponse>(ENDPOINTS.max3dpro.getGameConfig);
    },
    async getCurrentDraw() {
      return http.get<Max3dproCurrentDrawResponse>(ENDPOINTS.max3dpro.getCurrentDraw);
    },
    async placeBet(input) {
      return http.post<Max3dproPlaceBetResponse>(ENDPOINTS.max3dpro.placeBet, input);
    },
    async listPendingTickets(params) {
      return http.get<Max3dproListTicketsResponse>(ENDPOINTS.max3dpro.listPendingTickets, {
        params: params as Record<string, string | number | undefined>,
      });
    },
    async listTickets(params) {
      return http.get<Max3dproListTicketsResponse>(ENDPOINTS.max3dpro.listTickets, {
        params: params as Record<string, string | number | undefined>,
      });
    },
    async getTicketEntries(ticketId) {
      return http.get<Max3dproTicketEntriesResponse>(ENDPOINTS.max3dpro.getTicketEntries(ticketId));
    },
    async getEntryLines(entryId) {
      return http.get<Max3dproEntryLinesResponse>(ENDPOINTS.max3dpro.getEntryLines(entryId));
    },
  };
}
