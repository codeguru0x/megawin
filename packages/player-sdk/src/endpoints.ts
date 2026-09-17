/**
 * API Endpoints Registry
 *
 * Tập trung quản lý tất cả URL paths của MegaWin API.
 * Khi thêm API mới, chỉ cần thêm entry vào đây.
 *
 * @internal
 */
export const ENDPOINTS = {
  auth: {
    refresh: "/auth/refresh-token",
  },

  game: {
    listJackpots: "/games/jackpots",
  },

  keno: {
    getGameConfig: "/games/keno/config",
    placeBet: "/games/keno/bets",
    getCurrentDraw: "/games/keno/draws/current",
    listPendingTickets: "/games/keno/tickets/pending",
    listTickets: "/games/keno/tickets",
    getTicketEntries: (ticketId: string): string => `/games/keno/tickets/${ticketId}/entries`,
    listDrawResults: "/games/keno/draw-results",
    getDrawResult: (drawId: string): string => `/games/keno/draw-results/${drawId}`,
    getComboPopularity: (drawId: string): string => `/games/keno/draws/${drawId}/combo-popularity`,
  },

  lotto535: {
    getGameConfig: "/games/lotto535/config",
    placeBet: "/games/lotto535/bets",
    getCurrentDraw: "/games/lotto535/draws/current",
    getJackpot: "/games/lotto535/jackpot",
    listPendingTickets: "/games/lotto535/tickets/pending",
    listTickets: "/games/lotto535/tickets",
    getTicketEntries: (ticketId: string): string => `/games/lotto535/tickets/${ticketId}/entries`,
    getEntryLines: (entryId: string): string => `/games/lotto535/entries/${entryId}/lines`,
    listDrawResults: "/games/lotto535/draw-results",
    getDrawResult: (drawId: string): string => `/games/lotto535/draw-results/${drawId}`,
    getComboPopularity: (drawId: string): string => `/games/lotto535/draws/${drawId}/combo-popularity`,
  },

  mega645: {
    getGameConfig: "/games/mega645/config",
    placeBet: "/games/mega645/bets",
    getCurrentDraw: "/games/mega645/draws/current",
    getJackpot: "/games/mega645/jackpot",
    listPendingTickets: "/games/mega645/tickets/pending",
    listTickets: "/games/mega645/tickets",
    getTicketEntries: (ticketId: string): string => `/games/mega645/tickets/${ticketId}/entries`,
    getEntryLines: (entryId: string): string => `/games/mega645/entries/${entryId}/lines`,
    listDrawResults: "/games/mega645/draw-results",
    getDrawResult: (drawId: string): string => `/games/mega645/draw-results/${drawId}`,
    getComboPopularity: (drawId: string): string => `/games/mega645/draws/${drawId}/combo-popularity`,
  },

  power655: {
    getGameConfig: "/games/power655/config",
    placeBet: "/games/power655/bets",
    getCurrentDraw: "/games/power655/draws/current",
    getJackpot: "/games/power655/jackpot",
    listPendingTickets: "/games/power655/tickets/pending",
    listTickets: "/games/power655/tickets",
    getTicketEntries: (ticketId: string): string => `/games/power655/tickets/${ticketId}/entries`,
    getEntryLines: (entryId: string): string => `/games/power655/entries/${entryId}/lines`,
    listDrawResults: "/games/power655/draw-results",
    getDrawResult: (drawId: string): string => `/games/power655/draw-results/${drawId}`,
    getComboPopularity: (drawId: string): string => `/games/power655/draws/${drawId}/combo-popularity`,
  },

  max3d: {
    getGameConfig: "/games/max3d/config",
    placeBet: "/games/max3d/bets",
    getCurrentDraw: "/games/max3d/draws/current",
    listPendingTickets: "/games/max3d/tickets/pending",
    listTickets: "/games/max3d/tickets",
    getTicketEntries: (ticketId: string): string => `/games/max3d/tickets/${ticketId}/entries`,
    getEntryLines: (entryId: string): string => `/games/max3d/entries/${entryId}/lines`,
    listDrawResults: "/games/max3d/draw-results",
    getDrawResult: (drawId: string): string => `/games/max3d/draw-results/${drawId}`,
  },

  max3dpro: {
    getGameConfig: "/games/max3dpro/config",
    placeBet: "/games/max3dpro/bets",
    getCurrentDraw: "/games/max3dpro/draws/current",
    listPendingTickets: "/games/max3dpro/tickets/pending",
    listTickets: "/games/max3dpro/tickets",
    getTicketEntries: (ticketId: string): string => `/games/max3dpro/tickets/${ticketId}/entries`,
    getEntryLines: (entryId: string): string => `/games/max3dpro/entries/${entryId}/lines`,
    listDrawResults: "/games/max3dpro/draw-results",
    getDrawResult: (drawId: string): string => `/games/max3dpro/draw-results/${drawId}`,
  },

  bingo18: {
    getGameConfig: "/games/bingo18/config",
    placeBet: "/games/bingo18/bets",
    getCurrentDraw: "/games/bingo18/draws/current",
    listPendingTickets: "/games/bingo18/tickets/pending",
    listTickets: "/games/bingo18/tickets",
    getTicketEntries: (ticketId: string): string => `/games/bingo18/tickets/${ticketId}/entries`,
    listDrawResults: "/games/bingo18/draw-results",
    getDrawResult: (drawId: string): string => `/games/bingo18/draw-results/${drawId}`,
  },
} as const;
