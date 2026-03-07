/**
 * Power 6/55 API Module
 * @module
 */

import type { HttpClient } from "../http-client";
import type {
  Power655TicketPurchaseInput,
  Power655GameConfigResponse,
  Power655DrawInfo,
  Power655TicketSummary,
  Power655EntryResult,
} from "../power655";
import { ENDPOINTS } from "../endpoints";

export interface Power655ListTicketsParams {
  size?: number;
  cursor?: string;
  from?: string;
  to?: string;
}

export interface Power655PlaceBetResponse {
  ticketId: string;
  ticketNo: string;
  totalAmount: number;
}

export interface Power655CurrentDrawResponse {
  currentDraw: Power655DrawInfo | null;
  activeDraws: Power655DrawInfo[];
}

export interface Power655JackpotResponse {
  jackpot1Amount: number;
  jackpot2Amount: number;
  cycleId: string;
  openedAt: string;
}

export interface Power655ListTicketsResponse {
  tickets: Power655TicketSummary[];
  nextCursor: string | null;
  size: number;
}

export interface Power655TicketEntriesResponse {
  ticket: Power655TicketSummary;
  entries: Power655EntryResult[];
}

export interface Power655EntryLinesResponse {
  entryId: string;
  lines: Array<{ mainNumbers: number[] }>;
}

export interface Power655Api {
  getGameConfig(): Promise<Power655GameConfigResponse>;
  getCurrentDraw(): Promise<Power655CurrentDrawResponse>;
  getJackpot(): Promise<Power655JackpotResponse>;
  placeBet(input: Power655TicketPurchaseInput): Promise<Power655PlaceBetResponse>;
  listPendingTickets(params?: Power655ListTicketsParams): Promise<Power655ListTicketsResponse>;
  listTickets(params?: Power655ListTicketsParams): Promise<Power655ListTicketsResponse>;
  getTicketEntries(ticketId: string): Promise<Power655TicketEntriesResponse>;
  getEntryLines(entryId: string): Promise<Power655EntryLinesResponse>;
}

/** @internal */
export function createPower655Api(http: HttpClient): Power655Api {
  return {
    async getGameConfig() {
      return http.get<Power655GameConfigResponse>(ENDPOINTS.power655.getGameConfig);
    },
    async getCurrentDraw() {
      return http.get<Power655CurrentDrawResponse>(ENDPOINTS.power655.getCurrentDraw);
    },
    async getJackpot() {
      return http.get<Power655JackpotResponse>(ENDPOINTS.power655.getJackpot);
    },
    async placeBet(input) {
      return http.post<Power655PlaceBetResponse>(ENDPOINTS.power655.placeBet, input);
    },
    async listPendingTickets(params) {
      return http.get<Power655ListTicketsResponse>(ENDPOINTS.power655.listPendingTickets, {
        params: params as Record<string, string | number | undefined>,
      });
    },
    async listTickets(params) {
      return http.get<Power655ListTicketsResponse>(ENDPOINTS.power655.listTickets, {
        params: params as Record<string, string | number | undefined>,
      });
    },
    async getTicketEntries(ticketId) {
      return http.get<Power655TicketEntriesResponse>(ENDPOINTS.power655.getTicketEntries(ticketId));
    },
    async getEntryLines(entryId) {
      return http.get<Power655EntryLinesResponse>(ENDPOINTS.power655.getEntryLines(entryId));
    },
  };
}
