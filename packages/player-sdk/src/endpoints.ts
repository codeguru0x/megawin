/**
 * API Endpoints Registry
 *
 * Tập trung quản lý tất cả URL paths của API Gateway.
 * Khi thêm API mới, chỉ cần thêm entry vào đây.
 *
 * @internal
 */
export const ENDPOINTS = {
  auth: {
    refresh: "/auth/refresh",
    logout: "/auth/logout",
  },

  player: {
    balance: "/player/balance",
    betHistory: "/player/bets",
    gameResult: (gameId: string, roundId: string) =>
      `/player/games/${gameId}/results/${roundId}` as const,
  },

  keno: {
    placeBet: "/player/keno/bets",
  },

  lotto535: {
    placeBet: "/player/lotto535/bets",
  },
} as const;
