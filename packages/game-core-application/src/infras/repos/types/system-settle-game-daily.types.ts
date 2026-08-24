/**
 * Kết quả aggregate từ per-game settle draw reports theo financialDate.
 * Dùng làm input cho upsertGameDaily trong SystemSettleGameDailyRepository.
 */
export interface SettleGameDailyAggregateResult {
  /** Số kỳ quay đã settle trong ngày. */
  drawCount: number;
  /** Tổng số entry đã settle. */
  entryCount: number;
  /** Số player (unique accountId) trong ngày. */
  playerCount: number;
  /** Số tenant tham gia trong ngày. */
  tenantCount: number;
  /** Tổng tiền cược (VND). */
  totalStake: number;
  /** Tổng tiền thắng (VND). */
  totalWin: number;
  /** Tổng tiền trả thưởng (VND). */
  totalPayout: number;
  /** Gross Gaming Revenue = totalStake - totalPayout (VND). */
  ggr: number;
  /** Tổng hoa hồng đại lý (VND). */
  totalCommission: number;
  /** Lợi nhuận ròng = ggr - totalCommission (VND). */
  netProfit: number;
}

/**
 * Aggregate result khi nhóm theo financialDate — SUM tất cả game cho mỗi ngày.
 * Dùng cho tab "Tổng quan ngày" trong System Financial Reports.
 */
export interface DailyOverviewRow {
  financialDate: string;
  drawCount: number;
  entryCount: number;
  playerCount: number;
  tenantCount: number;
  /** Tổng doanh thu bán vé (VND). */
  totalStake: number;
  /** Tổng tiền thắng (VND). */
  totalWin: number;
  /** Tổng trả thưởng (VND). */
  totalPayout: number;
  /** Gross Gaming Revenue = totalStake - totalPayout (VND). */
  ggr: number;
  /** Tổng hoa hồng đại lý (VND). */
  totalCommission: number;
  /** Lợi nhuận ròng = ggr - totalCommission (VND). */
  netProfit: number;
}

/**
 * Aggregate result khi nhóm theo gameProduct — SUM tất cả ngày cho mỗi game.
 * Dùng cho tab "Theo game".
 */
export interface GameSummaryRow {
  gameProduct: string;
  drawCount: number;
  entryCount: number;
  playerCount: number;
  tenantCount: number;
  /** Tổng doanh thu bán vé (VND). */
  totalStake: number;
  /** Tổng tiền thắng (VND). */
  totalWin: number;
  /** Tổng trả thưởng (VND). */
  totalPayout: number;
  /** Gross Gaming Revenue = totalStake - totalPayout (VND). */
  ggr: number;
  /** Tổng hoa hồng đại lý (VND). */
  totalCommission: number;
  /** Lợi nhuận ròng = ggr - totalCommission (VND). */
  netProfit: number;
}

/**
 * Aggregate result khi nhóm theo KỲ THỜI GIAN (ngày/tuần/tháng) — 1 dòng = 1 kỳ.
 *
 * Khác `GameSummaryRow` (1 dòng = 1 game, gộp cả khoảng) và `DailyOverviewRow` (chỉ theo ngày,
 * không lọc được game): dòng này là **chuỗi thời gian**, có thể giới hạn ở 1 game. Sinh ra để
 * một lần gọi trả đúng chuỗi cần vẽ — vd "doanh thu Keno theo tháng" (xem `aggregateByPeriod`).
 *
 * KHÔNG có field `gameProduct`: khi lọc 1 game thì giá trị đó là hằng số cho mọi dòng, thêm vào
 * chỉ tạo một cột phân loại vô nghĩa mà biểu đồ có thể chọn nhầm làm trục X.
 */
export interface GamePeriodRow {
  /**
   * Khoá kỳ — `YYYY-MM-DD` (ngày, hoặc thứ Hai của tuần) hoặc `YYYY-MM` (tháng).
   * Xem `financialPeriodKey` trong `@megawin/shared/utils/financial-date`.
   */
  period: string;
  drawCount: number;
  entryCount: number;
  /** Tổng số player theo ngày CỘNG lại — người chơi nhiều ngày bị đếm lặp (xem `aggregateByPeriod`). */
  playerCount: number;
  /** Số tenant lớn nhất trong các ngày của kỳ (không cộng — tenant xuất hiện mọi ngày). */
  tenantCount: number;
  /** Tổng doanh thu bán vé (VND). */
  totalStake: number;
  /** Tổng tiền thắng (VND). */
  totalWin: number;
  /** Tổng trả thưởng (VND). */
  totalPayout: number;
  /** Gross Gaming Revenue = totalStake - totalPayout (VND). */
  ggr: number;
  /** Tổng hoa hồng đại lý (VND). */
  totalCommission: number;
  /** Lợi nhuận ròng = ggr - totalCommission (VND). */
  netProfit: number;
}

/**
 * Các chỉ số số có thể so sánh GIỮA game trong `aggregateByPeriodPerGame` (tham số `metric`).
 *
 * Đúng bằng field số của `GamePeriodRow` (trừ `period`) — liệt kê tay vì `z.enum` ở tầng tool
 * (`agent/tools/getFinancialTrend.ts`) cần mảng literal runtime, `keyof GamePeriodRow` không cho
 * ra được giá trị lúc chạy.
 */
export const GAME_PERIOD_METRIC_KEYS = [
  "drawCount",
  "entryCount",
  "playerCount",
  "tenantCount",
  "totalStake",
  "totalWin",
  "totalPayout",
  "ggr",
  "totalCommission",
  "netProfit",
] as const;

export type GamePeriodMetricKey = (typeof GAME_PERIOD_METRIC_KEYS)[number];

/**
 * 1 dòng = 1 kỳ, so sánh NHIỀU game trên CÙNG 1 chỉ số — mỗi game PIVOT thành 1 cột số riêng
 * (khoá là RAW `gameProduct` id, vd `"keno"`, `"power655"`).
 *
 * Sinh ra để trả đúng dạng "bảng nhóm-theo-game" mà biểu đồ cột-nhóm/nhiều-đường cần trong MỘT
 * lần gọi — khác `GamePeriodRow` (đủ 10 chỉ số nhưng CHỈ 1 game/dòng). Trước khi có row này, câu
 * "so sánh doanh thu thuần Keno và Power 6/55 theo tháng" phải gọi `aggregateByPeriod` 2 lần (mỗi
 * game 1 lần) rồi KHÔNG thể vẽ chung 1 chart, vì `renderChart` chế độ đọc-tool-trước chỉ đọc được
 * MỘT lần gọi gần nhất (sự cố 24/08, xem `apps/backoffice/agent/tools/renderChart.ts`).
 *
 * Khoá ngoài `period` KHÔNG tự đổi tên hiển thị — tầng UI tự map raw game id sang tên đầy đủ qua
 * `GAME_LABELS` (`CHART_REPORT_LABELS` ở `apps/backoffice/.../tool-renderers/registry.tsx`), vì
 * `GAME_LABELS` đã có sẵn đúng cặp key này (không cần thêm cơ chế map riêng).
 */
export interface GamePeriodByGameRow {
  period: string;
  [gameProduct: string]: string | number;
}

/**
 * Raw per-game data cho 1 ngày tài chính cụ thể.
 *
 * Dùng cho dashboard — client tự compute KPI totals, trend %, payout ratio.
 * 1 record = 1 game × 1 financialDate.
 * Trả về từ findByFinancialDates() trong SystemSettleGameDailyRepository.
 */
export interface DashboardGameDailyData {
  /** Game product identifier. */
  gameProduct: string;
  /** Ngày tài chính (YYYY-MM-DD). */
  financialDate: string;
  /** Số kỳ quay đã settle. */
  drawCount: number;
  /** Tổng số entry đã settle. */
  entryCount: number;
  /** Số player (unique accountId) trong ngày. */
  playerCount: number;
  /** Tổng tiền cược (VND). */
  totalStake: number;
  /** Tổng tiền thắng (VND). */
  totalWin: number;
  /** Tổng tiền trả thưởng (VND). */
  totalPayout: number;
  /** Gross Gaming Revenue = totalStake - totalPayout (VND). Có thể ÂM. */
  ggr: number;
  /** Tổng hoa hồng đại lý (VND). */
  totalCommission: number;
  /** Lợi nhuận ròng = ggr - totalCommission (VND). Có thể ÂM. */
  netProfit: number;
}
