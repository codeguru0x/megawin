/**
 * Game Core – Game Daily Report
 *
 * Collection: gameDailyReports
 *
 * Chứa 3 loại document trong cùng 1 collection (phân biệt qua reportType):
 *   - "game_draw":     per tenant × per game × per draw
 *   - "game_daily":    per tenant × per game × per date (tổng hợp)
 *   - "company_daily": per game × per date (toàn công ty)
 *
 * Dùng cho:
 *   - Dashboard backoffice: tổng doanh thu / lợi nhuận theo ngày
 *   - Báo cáo tài chính theo fiscal date, tenant, game
 *   - Theo dõi Jackpot tích luỹ theo kỳ
 */

export const GameReportType = {
  GameDraw: "game_draw",
  GameDaily: "game_daily",
  CompanyDaily: "company_daily",
} as const;

export type GameReportType = (typeof GameReportType)[keyof typeof GameReportType];

export const GAME_DAILY_REPORT_COLLECTION = "gameDailyReports";
