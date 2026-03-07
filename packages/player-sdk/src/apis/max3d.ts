/**
 * Max 3D API Module
 * @module
 */

import type { HttpClient } from "../http-client";
import type {
  Max3dTicketPurchaseInput,
  Max3dGameConfigResponse,
  Max3dDrawInfo,
  Max3dTicketSummary,
} from "../max3d";
import { ENDPOINTS } from "../endpoints";

export interface Max3dListTicketsParams {
  size?: number;
  cursor?: string;
  from?: string;
  to?: string;
}

export interface Max3dPlaceBetResponse {
  ticketId: string;
  ticketNo: string;
  totalAmount: number;
}

export interface Max3dCurrentDrawResponse {
  currentDraw: Max3dDrawInfo | null;
  activeDraws: Max3dDrawInfo[];
}

export interface Max3dListTicketsResponse {
  tickets: Max3dTicketSummary[];
  nextCursor: string | null;
  size: number;
}

export interface Max3dTicketEntriesResponse {
  ticket: Max3dTicketSummary;
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

export interface Max3dEntryLinesResponse {
  entryId: string;
  lines: Array<{ triplet: string }>;
}

export interface Max3dApi {
  getGameConfig(): Promise<Max3dGameConfigResponse>;
  getCurrentDraw(): Promise<Max3dCurrentDrawResponse>;
  placeBet(input: Max3dTicketPurchaseInput): Promise<Max3dPlaceBetResponse>;
  listPendingTickets(params?: Max3dListTicketsParams): Promise<Max3dListTicketsResponse>;
  listTickets(params?: Max3dListTicketsParams): Promise<Max3dListTicketsResponse>;
  getTicketEntries(ticketId: string): Promise<Max3dTicketEntriesResponse>;
  getEntryLines(entryId: string): Promise<Max3dEntryLinesResponse>;
}

/** @internal */
export function createMax3dApi(http: HttpClient): Max3dApi {
  return {
    async getGameConfig() {
      return http.get<Max3dGameConfigResponse>(ENDPOINTS.max3d.getGameConfig);
    },
    async getCurrentDraw() {
      return http.get<Max3dCurrentDrawResponse>(ENDPOINTS.max3d.getCurrentDraw);
    },
    async placeBet(input) {
      return http.post<Max3dPlaceBetResponse>(ENDPOINTS.max3d.placeBet, input);
    },
    async listPendingTickets(params) {
      return http.get<Max3dListTicketsResponse>(ENDPOINTS.max3d.listPendingTickets, {
        params: params as Record<string, string | number | undefined>,
      });
    },
    async listTickets(params) {
      return http.get<Max3dListTicketsResponse>(ENDPOINTS.max3d.listTickets, {
        params: params as Record<string, string | number | undefined>,
      });
    },
    async getTicketEntries(ticketId) {
      return http.get<Max3dTicketEntriesResponse>(ENDPOINTS.max3d.getTicketEntries(ticketId));
    },
    async getEntryLines(entryId) {
      return http.get<Max3dEntryLinesResponse>(ENDPOINTS.max3d.getEntryLines(entryId));
    },
  };
}
