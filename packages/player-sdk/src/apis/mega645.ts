/**
 * Mega 6/45 API Module
 * @module
 */

import type { HttpClient } from "../http-client";
import type {
  Mega645TicketPurchaseInput,
  Mega645GameConfigResponse,
  Mega645DrawInfo,
  Mega645TicketSummary,
  Mega645EntryResult,
} from "../mega645";
import { ENDPOINTS } from "../endpoints";

export interface Mega645ListTicketsParams {
  size?: number;
  cursor?: string;
  from?: string;
  to?: string;
}

export interface Mega645PlaceBetResponse {
  ticketId: string;
  ticketNo: string;
  totalAmount: number;
}

export interface Mega645CurrentDrawResponse {
  currentDraw: Mega645DrawInfo | null;
  activeDraws: Mega645DrawInfo[];
}

export interface Mega645JackpotResponse {
  jackpotAmount: number;
  cycleId: string;
  openedAt: string;
}

export interface Mega645ListTicketsResponse {
  tickets: Mega645TicketSummary[];
  nextCursor: string | null;
  size: number;
}

export interface Mega645TicketEntriesResponse {
  ticket: Mega645TicketSummary;
  entries: Mega645EntryResult[];
}

export interface Mega645EntryLinesResponse {
  entryId: string;
  lines: Array<{ mainNumbers: number[] }>;
}

export interface Mega645Api {
  getGameConfig(): Promise<Mega645GameConfigResponse>;
  getCurrentDraw(): Promise<Mega645CurrentDrawResponse>;
  getJackpot(): Promise<Mega645JackpotResponse>;
  placeBet(input: Mega645TicketPurchaseInput): Promise<Mega645PlaceBetResponse>;
  listPendingTickets(params?: Mega645ListTicketsParams): Promise<Mega645ListTicketsResponse>;
  listTickets(params?: Mega645ListTicketsParams): Promise<Mega645ListTicketsResponse>;
  getTicketEntries(ticketId: string): Promise<Mega645TicketEntriesResponse>;
  getEntryLines(entryId: string): Promise<Mega645EntryLinesResponse>;
}

/** @internal */
export function createMega645Api(http: HttpClient): Mega645Api {
  return {
    async getGameConfig() {
      return http.get<Mega645GameConfigResponse>(ENDPOINTS.mega645.getGameConfig);
    },
    async getCurrentDraw() {
      return http.get<Mega645CurrentDrawResponse>(ENDPOINTS.mega645.getCurrentDraw);
    },
    async getJackpot() {
      return http.get<Mega645JackpotResponse>(ENDPOINTS.mega645.getJackpot);
    },
    async placeBet(input) {
      return http.post<Mega645PlaceBetResponse>(ENDPOINTS.mega645.placeBet, input);
    },
    async listPendingTickets(params) {
      return http.get<Mega645ListTicketsResponse>(ENDPOINTS.mega645.listPendingTickets, {
        params: params as Record<string, string | number | undefined>,
      });
    },
    async listTickets(params) {
      return http.get<Mega645ListTicketsResponse>(ENDPOINTS.mega645.listTickets, {
        params: params as Record<string, string | number | undefined>,
      });
    },
    async getTicketEntries(ticketId) {
      return http.get<Mega645TicketEntriesResponse>(ENDPOINTS.mega645.getTicketEntries(ticketId));
    },
    async getEntryLines(entryId) {
      return http.get<Mega645EntryLinesResponse>(ENDPOINTS.mega645.getEntryLines(entryId));
    },
  };
}
