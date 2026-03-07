/**
 * Bingo 18 API Module
 * @module
 */

import type { HttpClient } from "../http-client";
import type {
  Bingo18TicketPurchaseInput,
  Bingo18GameConfigResponse,
  Bingo18DrawInfo,
  Bingo18TicketSummary,
} from "../bingo18";
import { ENDPOINTS } from "../endpoints";

export interface Bingo18ListTicketsParams {
  size?: number;
  cursor?: string;
  from?: string;
  to?: string;
}

export interface Bingo18PlaceBetResponse {
  ticketId: string;
  ticketNo: string;
  totalAmount: number;
}

export interface Bingo18CurrentDrawResponse {
  currentDraw: Bingo18DrawInfo | null;
  activeDraws: Bingo18DrawInfo[];
  lastResult: {
    drawId: string;
    drawDate: string;
    drawNo: number;
    numbers: number[];
    sum: number;
    publishedAt: string;
  } | null;
}

export interface Bingo18ListTicketsResponse {
  tickets: Bingo18TicketSummary[];
  nextCursor: string | null;
  size: number;
}

export interface Bingo18TicketEntriesResponse {
  ticket: Bingo18TicketSummary;
  entries: Array<{
    id: string;
    drawId: string;
    drawDate: string;
    status: string;
    amount: number;
    betCount: number;
    result?: {
      numbers: number[];
      sum: number;
      publishedAt: string;
    };
    outcome?: string;
    payout?: {
      winAmount: number;
      payoutAmount: number;
      boardPayouts: Array<{
        boardNo: string;
        playType: string;
        matchCount: number;
        winAmount: number;
      }>;
      sideBetPayouts: Array<{
        playType: string;
        sum?: number;
        bet?: string;
        outcome: string;
        isWin: boolean;
        winAmount: number;
      }>;
    };
  }>;
}

export interface Bingo18Api {
  getGameConfig(): Promise<Bingo18GameConfigResponse>;
  getCurrentDraw(): Promise<Bingo18CurrentDrawResponse>;
  placeBet(input: Bingo18TicketPurchaseInput): Promise<Bingo18PlaceBetResponse>;
  listPendingTickets(params?: Bingo18ListTicketsParams): Promise<Bingo18ListTicketsResponse>;
  listTickets(params?: Bingo18ListTicketsParams): Promise<Bingo18ListTicketsResponse>;
  getTicketEntries(ticketId: string): Promise<Bingo18TicketEntriesResponse>;
}

/** @internal */
export function createBingo18Api(http: HttpClient): Bingo18Api {
  return {
    async getGameConfig() {
      return http.get<Bingo18GameConfigResponse>(ENDPOINTS.bingo18.getGameConfig);
    },
    async getCurrentDraw() {
      return http.get<Bingo18CurrentDrawResponse>(ENDPOINTS.bingo18.getCurrentDraw);
    },
    async placeBet(input) {
      return http.post<Bingo18PlaceBetResponse>(ENDPOINTS.bingo18.placeBet, input);
    },
    async listPendingTickets(params) {
      return http.get<Bingo18ListTicketsResponse>(ENDPOINTS.bingo18.listPendingTickets, {
        params: params as Record<string, string | number | undefined>,
      });
    },
    async listTickets(params) {
      return http.get<Bingo18ListTicketsResponse>(ENDPOINTS.bingo18.listTickets, {
        params: params as Record<string, string | number | undefined>,
      });
    },
    async getTicketEntries(ticketId) {
      return http.get<Bingo18TicketEntriesResponse>(ENDPOINTS.bingo18.getTicketEntries(ticketId));
    },
  };
}
