/**
 * Unit test `chart-inference.ts` — dùng fixture output THẬT theo shape `DailyOverviewRow[]`
 * (`getFinancialDailyOverview`) và `GameSummaryRow[]` (`getFinancialByGame`), xem
 * `packages/game-core-application/src/use-cases/reports/types.ts`.
 */

import { describe, expect, it } from "vitest";

import {
  buildChartModel,
  ChartFieldType,
  ChartKind,
  type ChartModel,
  classifyColumns,
  extractRows,
  scatterAxisPair,
  secondaryAxisKeys,
} from "@/lib/chart";

/** 5 ngày liên tiếp — khớp `GetDailyOverviewOutput.data: DailyOverviewRow[]`. */
const DAILY_OVERVIEW_OUTPUT = {
  data: [
    {
      financialDate: "2026-08-15",
      drawCount: 48,
      entryCount: 12_500,
      playerCount: 3_200,
      tenantCount: 5,
      totalStake: 850_000_000,
      totalWin: 620_000_000,
      totalPayout: 640_000_000,
      ggr: 210_000_000,
      totalCommission: 42_000_000,
      netProfit: 168_000_000,
    },
    {
      financialDate: "2026-08-16",
      drawCount: 48,
      entryCount: 13_100,
      playerCount: 3_350,
      tenantCount: 5,
      totalStake: 910_000_000,
      totalWin: 700_000_000,
      totalPayout: 715_000_000,
      ggr: 195_000_000,
      totalCommission: 45_500_000,
      netProfit: 149_500_000,
    },
    {
      financialDate: "2026-08-17",
      drawCount: 48,
      entryCount: 12_800,
      playerCount: 3_280,
      tenantCount: 5,
      totalStake: 880_000_000,
      totalWin: 610_000_000,
      totalPayout: 625_000_000,
      ggr: 255_000_000,
      totalCommission: 44_000_000,
      netProfit: 211_000_000,
    },
    {
      financialDate: "2026-08-18",
      drawCount: 48,
      entryCount: 14_200,
      playerCount: 3_500,
      tenantCount: 5,
      totalStake: 980_000_000,
      totalWin: 750_000_000,
      totalPayout: 770_000_000,
      ggr: 210_000_000,
      totalCommission: 49_000_000,
      netProfit: 161_000_000,
    },
    {
      financialDate: "2026-08-19",
      drawCount: 48,
      entryCount: 13_600,
      playerCount: 3_420,
      tenantCount: 5,
      totalStake: 930_000_000,
      totalWin: 680_000_000,
      totalPayout: 695_000_000,
      ggr: 235_000_000,
      totalCommission: 46_500_000,
      netProfit: 188_500_000,
    },
  ],
};

/** 4 game — khớp `GetGameSummaryOutput.data: GameSummaryRow[]`. */
const GAME_SUMMARY_OUTPUT = {
  data: [
    {
      gameProduct: "keno",
      drawCount: 240,
      entryCount: 62_000,
      playerCount: 8_400,
      tenantCount: 5,
      totalStake: 4_200_000_000,
      totalWin: 3_100_000_000,
      totalPayout: 3_180_000_000,
      ggr: 1_020_000_000,
      totalCommission: 210_000_000,
      netProfit: 810_000_000,
    },
    {
      gameProduct: "lotto535",
      drawCount: 30,
      entryCount: 18_500,
      playerCount: 5_100,
      tenantCount: 5,
      totalStake: 1_850_000_000,
      totalWin: 1_200_000_000,
      totalPayout: 1_260_000_000,
      ggr: 590_000_000,
      totalCommission: 92_500_000,
      netProfit: 497_500_000,
    },
    {
      gameProduct: "mega645",
      drawCount: 15,
      entryCount: 9_200,
      playerCount: 3_600,
      tenantCount: 5,
      totalStake: 920_000_000,
      totalWin: 580_000_000,
      totalPayout: 610_000_000,
      ggr: 310_000_000,
      totalCommission: 46_000_000,
      netProfit: 264_000_000,
    },
    {
      gameProduct: "power655",
      drawCount: 8,
      entryCount: 4_100,
      playerCount: 2_050,
      tenantCount: 5,
      totalStake: 480_000_000,
      totalWin: 290_000_000,
      totalPayout: 305_000_000,
      ggr: 175_000_000,
      totalCommission: 24_000_000,
      netProfit: 151_000_000,
    },
  ],
};

describe("extractRows", () => {
  it("rút rows từ field data khi output là object bọc mảng", () => {
    expect(extractRows(DAILY_OVERVIEW_OUTPUT)).toHaveLength(5);
    expect(extractRows(GAME_SUMMARY_OUTPUT)).toHaveLength(4);
  });

  it("nhận trực tiếp output đã là mảng object", () => {
    expect(extractRows(DAILY_OVERVIEW_OUTPUT.data)).toHaveLength(5);
  });

  it("trả null khi output không có mảng object nào (KPI object đơn)", () => {
    expect(extractRows({ totalStake: 1_000, netProfit: 200 })).toBeNull();
  });

  it("trả null khi mảng chỉ có 1 phần tử (không đủ vẽ chart)", () => {
    expect(extractRows({ data: [DAILY_OVERVIEW_OUTPUT.data[0]] })).toBeNull();
  });

  it("trả null khi mảng là primitive, không phải object", () => {
    expect(extractRows({ data: [1, 2, 3] })).toBeNull();
  });
});

describe("classifyColumns", () => {
  it("phân loại đúng financialDate là time, các field tiền là currency, count là number", () => {
    const rows = extractRows(DAILY_OVERVIEW_OUTPUT);
    expect(rows).not.toBeNull();
    const columns = classifyColumns(rows ?? []);
    const byKey = new Map(columns.map((c) => [c.key, c.type]));

    expect(byKey.get("financialDate")).toBe(ChartFieldType.Time);
    expect(byKey.get("totalStake")).toBe(ChartFieldType.Currency);
    expect(byKey.get("ggr")).toBe(ChartFieldType.Currency);
    expect(byKey.get("netProfit")).toBe(ChartFieldType.Currency);
    expect(byKey.get("entryCount")).toBe(ChartFieldType.Number);
    expect(byKey.get("playerCount")).toBe(ChartFieldType.Number);
  });

  it("phân loại gameProduct là category (distinct nhỏ)", () => {
    const rows = extractRows(GAME_SUMMARY_OUTPUT);
    expect(rows).not.toBeNull();
    const columns = classifyColumns(rows ?? []);
    const gameColumn = columns.find((c) => c.key === "gameProduct");

    expect(gameColumn?.type).toBe(ChartFieldType.Category);
    expect(gameColumn?.distinctCount).toBe(4);
  });

  // Feedback QA 24/08: hướng dẫn `rows` ad-hoc (`renderChart.ts`/`55-charts.md`) buộc model viết key
  // tiếng Việt CÓ DẤU ("tổng tiền cược" thay vì "totalStake"). `CURRENCY_NAME_PATTERN`/
  // `PERCENT_NAME_PATTERN` trước đó chỉ khớp tiếng Anh ⇒ field tiền/% tiếng Việt rơi về `number`
  // thường, mất định dạng K/M/B VND và khiến radar/radialBar (yêu cầu MỌI series là `percent`)
  // không bao giờ được chọn cho dữ liệu ad-hoc dù hợp lệ.
  it("phân loại đúng field tiền tiếng Việt CÓ DẤU ('tổng tiền cược', 'doanh thu') là currency", () => {
    const rows = [
      { thang: "Tháng 1", "tổng tiền cược": 4_200_000, "doanh thu": 1_100_000 },
      { thang: "Tháng 2", "tổng tiền cược": 5_600_000, "doanh thu": 900_000 },
      { thang: "Tháng 3", "tổng tiền cược": 3_100_000, "doanh thu": 1_400_000 },
    ];
    const columns = classifyColumns(rows);
    const byKey = new Map(columns.map((c) => [c.key, c.type]));

    expect(byKey.get("tổng tiền cược")).toBe(ChartFieldType.Currency);
    expect(byKey.get("doanh thu")).toBe(ChartFieldType.Currency);
  });

  it("phân loại đúng field tỷ lệ tiếng Việt CÓ DẤU ('tỷ lệ thắng', 'tỉ lệ chuyển đổi') là percent", () => {
    const rows = [
      { nhom: "Nhóm A", "tỷ lệ thắng": 0.42, "tỉ lệ chuyển đổi": 0.18 },
      { nhom: "Nhóm B", "tỷ lệ thắng": 0.55, "tỉ lệ chuyển đổi": 0.22 },
      { nhom: "Nhóm C", "tỷ lệ thắng": 0.3, "tỉ lệ chuyển đổi": 0.4 },
    ];
    const columns = classifyColumns(rows);
    const byKey = new Map(columns.map((c) => [c.key, c.type]));

    expect(byKey.get("tỷ lệ thắng")).toBe(ChartFieldType.Percent);
    expect(byKey.get("tỉ lệ chuyển đổi")).toBe(ChartFieldType.Percent);
  });
});

describe("buildChartModel", () => {
  it("daily overview (time axis) → mặc định kind line, trục X = financialDate", () => {
    const model = buildChartModel(DAILY_OVERVIEW_OUTPUT, undefined, "Tổng quan theo ngày");

    expect(model).not.toBeNull();
    expect(model?.x.dataKey).toBe("financialDate");
    expect(model?.x.type).toBe(ChartFieldType.Time);
    expect(model?.kind).toBe(ChartKind.Line);
    expect(model?.allowedKinds).toContain(ChartKind.Line);
    // Area chỉ phù hợp khi CHỈ 1 series (catalog suitability) — ở đây có 4 series currency nên KHÔNG có Area.
    expect(model?.allowedKinds).not.toContain(ChartKind.Area);
    expect(model?.rows).toHaveLength(5);
    expect(model?.rejectedKind).toBeUndefined();
    // Ưu tiên currency lên đầu series (totalStake/totalWin/totalPayout/ggr/totalCommission/netProfit đều currency,
    // entryCount/playerCount/tenantCount/drawCount là number) — chỉ lấy tối đa 4 series.
    expect(model?.series.length).toBeLessThanOrEqual(4);
    expect(model?.series.every((s) => s.type === ChartFieldType.Currency)).toBe(true);
  });

  it("game summary (category axis, 4 mục) → mặc định kind bar", () => {
    const model = buildChartModel(GAME_SUMMARY_OUTPUT, undefined, "So sánh theo game");

    expect(model).not.toBeNull();
    expect(model?.x.dataKey).toBe("gameProduct");
    expect(model?.x.type).toBe(ChartFieldType.Category);
    expect(model?.kind).toBe(ChartKind.Bar);
    expect(model?.rows).toHaveLength(4);
  });

  it("xLabel từ override: mã game thô đổi thành tên hiển thị", () => {
    // Feedback 24/08: chart/bảng in `power655`, `lotto535` trong khi cả backoffice gọi là
    // `Power 6/55`, `Lotto 5/35`. Nhãn phải đi qua `model.xLabel` (nguồn duy nhất) chứ không map lại
    // ở từng chỗ vẽ — giá trị trục X xuất hiện ở tick, chú giải, tooltip và bảng.
    const labels: Record<string, string> = { power655: "Power 6/55", lotto535: "Lotto 5/35" };
    const model = buildChartModel(GAME_SUMMARY_OUTPUT, undefined, "So sánh theo game", {
      xLabel: (value) => labels[value],
    });

    expect(model?.xLabel?.("power655")).toBe("Power 6/55");
    expect(model?.xLabel?.("lotto535")).toBe("Lotto 5/35");
    // Mã lạ (game mới chưa có nhãn) → `undefined` để nơi vẽ tự rơi về giá trị thô, không in rỗng.
    expect(model?.xLabel?.("unknown_game")).toBeUndefined();
    // `rows` KHÔNG bị đổi: số liệu và khoá gốc giữ nguyên, chỉ lớp hiển thị mới đổi tên.
    expect(model?.rows.map((row) => row["gameProduct"])).toEqual(
      GAME_SUMMARY_OUTPUT.data.map((row) => row.gameProduct),
    );
  });

  it("không khai xLabel → model.xLabel undefined (giá trị trục giữ nguyên)", () => {
    const model = buildChartModel(GAME_SUMMARY_OUTPUT, undefined, "So sánh theo game");

    expect(model?.xLabel).toBeUndefined();
  });

  it("seriesType từ override: ép cột mã game thô (keno/power655) thành currency", () => {
    // Bug 24/08: `getFinancialTrendByGame` trả cột SERIES là mã game thô (`keno`, `power655`),
    // không phải tên chỉ số (`ggr`, `totalStake`) — `CURRENCY_NAME_PATTERN` không khớp mã game nên
    // 2 cột này bị suy luận về `number` thường dù `metric` yêu cầu là tiền, mất định dạng ₫ ở
    // tooltip/trục. `registry.tsx` phải tự ép qua `seriesType` dựa trên `metric` của lần gọi.
    const gameCompareRows = [
      { period: "2026-01", keno: 100_000, power655: 200_000 },
      { period: "2026-02", keno: 150_000, power655: 250_000 },
    ];
    const model = buildChartModel(gameCompareRows, ChartKind.Bar, "So sánh Keno và Power 6/55 theo tháng", {
      seriesType: () => ChartFieldType.Currency,
    });

    expect(model?.series.map((s) => s.type)).toEqual([ChartFieldType.Currency, ChartFieldType.Currency]);
  });

  it("seriesType trả undefined cho 1 cột → chỉ ép cột đó, giữ nguyên kiểu suy luận cho cột khác", () => {
    const mixedRows = [
      { period: "2026-01", keno: 100_000, playerCount: 12 },
      { period: "2026-02", keno: 150_000, playerCount: 20 },
    ];
    const model = buildChartModel(mixedRows, ChartKind.Bar, "So sánh Keno", {
      seriesType: (key) => (key === "keno" ? ChartFieldType.Currency : undefined),
    });

    const kenoSeries = model?.series.find((s) => s.dataKey === "keno");
    const playerCountSeries = model?.series.find((s) => s.dataKey === "playerCount");
    expect(kenoSeries?.type).toBe(ChartFieldType.Currency);
    expect(playerCountSeries?.type).toBe(ChartFieldType.Number);
  });

  it("requestedKind hợp lệ (nằm trong allowedKinds) → dùng đúng kind đó, không có rejectedKind", () => {
    // Single-series time data (chỉ totalStake) → Area hợp lệ theo catalog (Area yêu cầu !hasMultiSeries).
    const singleSeriesOutput = {
      data: DAILY_OVERVIEW_OUTPUT.data.map((row) => ({ financialDate: row.financialDate, totalStake: row.totalStake })),
    };
    const model = buildChartModel(singleSeriesOutput, ChartKind.Area, "Doanh thu theo ngày");

    expect(model?.kind).toBe(ChartKind.Area);
    expect(model?.rejectedKind).toBeUndefined();
  });

  it("requestedKind KHÔNG hợp lệ (pie cho time-series nhiều series) → fallback default + rejectedKind ghi lại", () => {
    const model = buildChartModel(DAILY_OVERVIEW_OUTPUT, ChartKind.Pie, "Tổng quan theo ngày");

    expect(model).not.toBeNull();
    expect(model?.kind).not.toBe(ChartKind.Pie);
    expect(model?.allowedKinds).not.toContain(ChartKind.Pie);
    expect(model?.rejectedKind).toBe(ChartKind.Pie);
  });

  // Pie/donut chỉ biểu diễn được MỘT tổng: `<Pie>` vẽ `series[0]` và bỏ im lặng phần còn lại. Report
  // tài chính theo game có 4 series tiền (`pickSeries` giữ tối đa 4) ⇒ chọn pie ở đây nghĩa là 3
  // series biến mất khỏi hình mà không có dấu hiệu nào. Đúng lỗi 24/08: card tiêu đề "Doanh thu Keno
  // và Power 6/55 theo tháng" vẽ vành khuyên 82%/15% — hoàn toàn là tỷ trọng của Keno, Power 6/55
  // không xuất hiện. Muốn vẽ tỷ trọng thì dữ liệu phải chỉ còn MỘT cột số (xem test kế tiếp).
  it("requestedKind = pie cho dữ liệu NHIỀU series (dù trục phân loại nhỏ) → reject, fallback cột", () => {
    const model = buildChartModel(GAME_SUMMARY_OUTPUT, ChartKind.Pie, "So sánh theo game");

    expect(model?.series.length).toBeGreaterThan(1);
    expect(model?.kind).toBe(ChartKind.Bar);
    expect(model?.allowedKinds).not.toContain(ChartKind.Pie);
    expect(model?.allowedKinds).not.toContain(ChartKind.Donut);
    expect(model?.rejectedKind).toBe(ChartKind.Pie);
  });

  it("requestedKind = pie cho trục phân loại + ĐÚNG 1 cột số → dùng pie, không reject", () => {
    const shareRows = {
      data: [
        { gameProduct: "keno", totalStake: 4_200_000_000 },
        { gameProduct: "lotto535", totalStake: 1_100_000_000 },
        { gameProduct: "mega645", totalStake: 2_400_000_000 },
      ],
    };

    const model = buildChartModel(shareRows, ChartKind.Pie, "Tỷ trọng tiền cược theo game");

    expect(model?.series).toHaveLength(1);
    expect(model?.kind).toBe(ChartKind.Pie);
    expect(model?.allowedKinds).toContain(ChartKind.Donut);
    expect(model?.rejectedKind).toBeUndefined();
  });

  it("output không chartable (KPI đơn, không có mảng ≥ 2 phần tử) → null", () => {
    const model = buildChartModel({ totalStake: 1_000_000, netProfit: 200_000 }, undefined, "KPI");
    expect(model).toBeNull();
  });

  // Ca lỗi 24/08 nguyên văn: rows do model tự dựng (tháng × 2 game) rồi yêu cầu vành khuyên. Một vòng
  // tròn không thể chứa 2 chuỗi, nên nếu cho phép thì Power 6/55 mất hẳn khỏi hình trong khi tiêu đề
  // và phần nhận xét vẫn nói về cả hai game — người đọc không có cách nào biết.
  it("tháng × 2 game (2 series) → pie/donut bị loại khỏi allowedKinds", () => {
    const twoGamesByMonth = {
      data: [
        { thang: "Tháng 3", keno: 480_000, power655: 0 },
        { thang: "Tháng 4", keno: 11_030_000, power655: 9_800_000 },
        { thang: "Tháng 6", keno: 1_960_000, power655: 26_180_000 },
      ],
    };

    const model = buildChartModel(twoGamesByMonth, ChartKind.Donut, "Doanh thu Keno và Power 6/55 theo tháng");

    expect(model?.series).toHaveLength(2);
    expect(model?.allowedKinds).not.toContain(ChartKind.Donut);
    expect(model?.allowedKinds).not.toContain(ChartKind.Pie);
    expect(model?.rejectedKind).toBe(ChartKind.Donut);
  });

  // Shape `GamePeriodRow` (`getFinancialTrend`) — chuỗi theo kỳ, khoá kỳ là `period` chứ không phải
  // `financialDate`. Tool này sinh ra để chặn sự cố 24/08 (biểu đồ vẽ nhầm dữ liệu vì chuỗi phải ghép
  // từ 6 lần gọi), nên việc trục X bám đúng `period` là điều kiện để nó có ích — nếu suy luận chọn
  // `drawCount`/`playerCount` làm trục X thì chuỗi thời gian biến thành biểu đồ phân bố.
  it("chuỗi theo kỳ tháng (period = YYYY-MM) → trục X là period, kiểu time", () => {
    const monthlyTrend = {
      data: [
        { period: "2026-04", drawCount: 67, playerCount: 42, totalStake: 11_030_000, netProfit: -4_525_078_000 },
        { period: "2026-05", drawCount: 0, playerCount: 0, totalStake: 0, netProfit: 0 },
        { period: "2026-06", drawCount: 7, playerCount: 7, totalStake: 1_960_000, netProfit: -19_184_003_000 },
      ],
    };

    const model = buildChartModel(monthlyTrend, undefined, "Tài chính Keno theo tháng");

    expect(model?.x.dataKey).toBe("period");
    expect(model?.x.type).toBe(ChartFieldType.Time);
    // Mốc bằng 0 KHÔNG bị loại: tháng 5 = 0 phải còn trong chuỗi, nếu không các mốc sau dồn lên và
    // nhận xét lệch tháng (đúng lỗi user báo 24/08).
    expect(model?.rows.map((row) => row["period"])).toEqual(["2026-04", "2026-05", "2026-06"]);
  });

  it("chuỗi theo kỳ tuần (period = thứ Hai dạng YYYY-MM-DD) → trục X là period, kiểu time", () => {
    const weeklyTrend = {
      data: [
        { period: "2026-07-06", totalStake: 1_400_000, netProfit: 460_000 },
        { period: "2026-07-13", totalStake: 0, netProfit: 0 },
        { period: "2026-07-20", totalStake: 320_000, netProfit: 90_000 },
      ],
    };

    const model = buildChartModel(weeklyTrend, undefined, "Tài chính theo tuần");

    expect(model?.x.dataKey).toBe("period");
    expect(model?.x.type).toBe(ChartFieldType.Time);
  });

  it("output có mảng nhưng không cột nào phân loại được thành time/category → null", () => {
    // Mọi field đều là id-like hoặc distinct quá lớn (free-text) → không chọn được trục X.
    const model = buildChartModel(
      {
        data: [
          { _id: "a1b2c3", note: "abc def ghi" },
          { _id: "d4e5f6", note: "jkl mno pqr" },
          { _id: "g7h8i9", note: "stu vwx yz1" },
        ],
      },
      undefined,
      "Không chartable",
    );
    expect(model).toBeNull();
  });

  it("rows > MAX_POINTS (time axis) → tỉa về 60 điểm gần nhất, vẫn sort tăng dần", () => {
    const manyDays = Array.from({ length: 90 }, (_, i) => ({
      financialDate: `2026-${String(Math.floor(i / 28) + 1).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`,
      totalStake: 100_000_000 + i * 1_000_000,
    }));

    const model = buildChartModel({ data: manyDays }, undefined, "90 ngày");

    expect(model).not.toBeNull();
    expect(model?.rows.length).toBe(60);
    const dates = (model?.rows ?? []).map((r) => r.financialDate as string);
    expect(dates).toEqual([...dates].sort());
  });
});

/**
 * Regression cho bug 23/08: staff dán CSV `records,invocations` (histogram — không có cột thời gian
 * hay phân loại nào) thì `pickXAxis` trả `null` ⇒ UI báo "không vẽ được" dù dữ liệu vẽ được bình
 * thường. Xem JSDoc `pickXAxis` (`chart-inference.ts`).
 */
describe("buildChartModel — trục X là số (dữ liệu staff dán, histogram)", () => {
  /** Đúng dữ liệu staff dán trong ảnh: bucket số records ↔ số lượt gọi. */
  const HISTOGRAM_ROWS = [
    { records: 1, invocations: 179_644 },
    { records: 2, invocations: 23_852 },
    { records: 3, invocations: 2_781 },
    { records: 4, invocations: 346 },
    { records: 5, invocations: 79 },
    { records: 6, invocations: 61 },
    { records: 7, invocations: 45 },
    { records: 8, invocations: 50 },
    { records: 9, invocations: 51 },
    { records: 10, invocations: 337 },
  ];

  it("chọn cột số ĐẦU TIÊN làm trục X thay vì trả null", () => {
    const model = buildChartModel(HISTOGRAM_ROWS, undefined, "Phân bố records");

    expect(model).not.toBeNull();
    expect(model?.x.dataKey).toBe("records");
    expect(model?.x.type).toBe(ChartFieldType.Number);
    expect(model?.series.map((s) => s.dataKey)).toEqual(["invocations"]);
  });

  it("mặc định vẽ cột (phân bố theo bucket đọc bằng cột rõ hơn đường)", () => {
    const model = buildChartModel(HISTOGRAM_ROWS, undefined, "Phân bố records");

    expect(model?.kind).toBe(ChartKind.Bar);
    expect(model?.allowedKinds).toContain(ChartKind.Bar);
    expect(model?.allowedKinds).toContain(ChartKind.Line);
  });

  it("KHÔNG cho phép dạng tỷ trọng cho trục số (mỗi bucket không phải 'phần của tổng')", () => {
    const model = buildChartModel(HISTOGRAM_ROWS, ChartKind.Pie, "Phân bố records");

    expect(model?.allowedKinds).not.toContain(ChartKind.Pie);
    expect(model?.allowedKinds).not.toContain(ChartKind.Donut);
    expect(model?.rejectedKind).toBe(ChartKind.Pie);
  });

  it("sort trục X theo GIÁ TRỊ SỐ, không phải chuỗi (10 phải sau 9)", () => {
    const shuffled = [...HISTOGRAM_ROWS].reverse();
    const model = buildChartModel(shuffled, undefined, "Phân bố records");
    const xs = (model?.rows ?? []).map((r) => Number(r.records));

    expect(xs).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("chỉ có 1 cột số duy nhất → vẫn null (không có gì để vẽ theo trục đó)", () => {
    const model = buildChartModel([{ records: 1 }, { records: 2 }, { records: 3 }], undefined, "1 cột");
    expect(model).toBeNull();
  });

  it("chỉ có cột tiền → null (tiền là đại lượng ĐO, không làm trục X)", () => {
    const model = buildChartModel(
      [
        { totalStake: 100, netProfit: 20 },
        { totalStake: 200, netProfit: 40 },
        { totalStake: 300, netProfit: 60 },
      ],
      undefined,
      "Chỉ tiền",
    );
    expect(model).toBeNull();
  });
});

/** Chuỗi gộp theo tháng `YYYY-MM` — trước 23/08 bị coi là `category` (xem `ISO_MONTH_PATTERN`). */
describe("buildChartModel — tháng YYYY-MM là trục thời gian", () => {
  const MONTHLY_ROWS = [
    { month: "2026-03", totalStake: 56_200_000 },
    { month: "2026-04", totalStake: 2_730_000_000 },
    { month: "2026-05", totalStake: 3_070_000_000 },
    { month: "2026-06", totalStake: 64_700_000 },
    { month: "2026-07", totalStake: 188_100_000 },
    { month: "2026-08", totalStake: 910_000 },
  ];

  it("phân loại month là Time, không phải Category", () => {
    const columns = classifyColumns(MONTHLY_ROWS);
    expect(columns.find((c) => c.key === "month")?.type).toBe(ChartFieldType.Time);
  });

  it("cho phép đường/miền (trục thời gian) và KHÔNG cho tròn/radar", () => {
    const model = buildChartModel(MONTHLY_ROWS, undefined, "Doanh thu theo tháng");

    expect(model?.x.type).toBe(ChartFieldType.Time);
    expect(model?.allowedKinds).toContain(ChartKind.Line);
    expect(model?.allowedKinds).toContain(ChartKind.Area);
    expect(model?.allowedKinds).not.toContain(ChartKind.Pie);
    expect(model?.allowedKinds).not.toContain(ChartKind.Donut);
    expect(model?.allowedKinds).not.toContain(ChartKind.Radar);
    expect(model?.allowedKinds).not.toContain(ChartKind.RadialBar);
  });
});

// Bug QA 24/08: browser test radar chart 9 lần với dữ liệu % hợp lệ, hệ thống LUÔN tự đổi sang
// bar/line không còn lý do dữ liệu nào để giải thích — nghi ngờ radar gần như không bao giờ được
// chọn trên thực tế. Nguyên nhân: model viết key ad-hoc CÓ DẤU theo hướng dẫn mới ("tỷ lệ thắng"),
// nhưng `PERCENT_NAME_PATTERN` cũ chỉ khớp tiếng Anh ⇒ mọi series bị phân loại `number` thay vì
// `percent` ⇒ `allPercentSeries` (điều kiện radar) luôn false dù dữ liệu đúng là % cả.
describe("buildChartModel — radar với field % viết tiếng Việt (bug QA 24/08)", () => {
  const WIN_RATE_BY_GAME = [
    { game: "Keno", "tỷ lệ thắng": 0.42, "tỷ lệ hoà": 0.05, "tỷ lệ thua": 0.53 },
    { game: "Lotto 5/35", "tỷ lệ thắng": 0.31, "tỷ lệ hoà": 0.02, "tỷ lệ thua": 0.67 },
    { game: "Mega 6/45", "tỷ lệ thắng": 0.28, "tỷ lệ hoà": 0.01, "tỷ lệ thua": 0.71 },
    { game: "Power 6/55", "tỷ lệ thắng": 0.25, "tỷ lệ hoà": 0.01, "tỷ lệ thua": 0.74 },
  ];

  it("phân loại đủ 3 field % là Percent, KHÔNG rơi về Number", () => {
    const columns = classifyColumns(WIN_RATE_BY_GAME);
    const byKey = new Map(columns.map((c) => [c.key, c.type]));

    expect(byKey.get("tỷ lệ thắng")).toBe(ChartFieldType.Percent);
    expect(byKey.get("tỷ lệ hoà")).toBe(ChartFieldType.Percent);
    expect(byKey.get("tỷ lệ thua")).toBe(ChartFieldType.Percent);
  });

  it("requestedKind = radar cho dữ liệu 3 chỉ số % tiếng Việt → CHẤP NHẬN, không bị đổi sang bar", () => {
    const model = buildChartModel(WIN_RATE_BY_GAME, ChartKind.Radar, "Tỷ lệ thắng/hoà/thua theo game");

    expect(model?.kind).toBe(ChartKind.Radar);
    expect(model?.allowedKinds).toContain(ChartKind.Radar);
    expect(model?.rejectedKind).toBeUndefined();
  });
});

/** Siết suitability 23/08 — các dạng từng được cho phép sai (ảnh 4-5). */
describe("suitability đã siết", () => {
  it("radar cần ≥ 2 series CÙNG thang % — 1 series tiền thì không", () => {
    const model = buildChartModel(
      [
        { tier: "jackpot", winAmount: 100 },
        { tier: "tier2", winAmount: 200 },
        { tier: "tier3", winAmount: 300 },
      ],
      ChartKind.Radar,
      "Theo hạng giải",
    );

    expect(model?.allowedKinds).not.toContain(ChartKind.Radar);
    expect(model?.rejectedKind).toBe(ChartKind.Radar);
  });

  it("tròn KHÔNG cho phép khi series chính có giá trị ÂM", () => {
    const model = buildChartModel(
      [
        { gameProduct: "keno", netProfit: 100 },
        { gameProduct: "mega645", netProfit: -50 },
        { gameProduct: "power655", netProfit: 30 },
      ],
      ChartKind.Pie,
      "Lãi/lỗ theo game",
    );

    expect(model?.allowedKinds).not.toContain(ChartKind.Pie);
    expect(model?.rejectedKind).toBe(ChartKind.Pie);
  });

  it("vòng tiến độ CHỈ cho chỉ số % — dữ liệu tiền thì không", () => {
    const model = buildChartModel(
      [
        { gameProduct: "keno", totalStake: 100 },
        { gameProduct: "mega645", totalStake: 200 },
      ],
      ChartKind.RadialBar,
      "Doanh thu theo game",
    );

    expect(model?.allowedKinds).not.toContain(ChartKind.RadialBar);
  });

  it("kết hợp cần ≥ 2 ĐƠN VỊ khác nhau — nhiều series cùng tiền thì không", () => {
    const model = buildChartModel(DAILY_OVERVIEW_OUTPUT, ChartKind.Composed, "Tổng quan theo ngày");

    expect(model?.allowedKinds).not.toContain(ChartKind.Composed);
    expect(model?.rejectedKind).toBe(ChartKind.Composed);
  });

  it("kết hợp ĐƯỢC phép khi có tiền + % theo thời gian", () => {
    const model = buildChartModel(
      [
        { financialDate: "2026-08-15", totalStake: 100, payoutRatio: 0.7 },
        { financialDate: "2026-08-16", totalStake: 120, payoutRatio: 0.72 },
        { financialDate: "2026-08-17", totalStake: 110, payoutRatio: 0.68 },
      ],
      ChartKind.Composed,
      "Doanh thu + tỷ lệ trả thưởng",
    );

    expect(model?.allowedKinds).toContain(ChartKind.Composed);
    expect(model?.kind).toBe(ChartKind.Composed);
    expect(model?.rejectedKind).toBeUndefined();
  });
});

describe("secondaryAxisKeys", () => {
  it("tách series khác ĐƠN VỊ với series đầu sang trục phải", () => {
    const model = buildChartModel(
      [
        { financialDate: "2026-08-15", totalStake: 100, payoutRatio: 0.7 },
        { financialDate: "2026-08-16", totalStake: 120, payoutRatio: 0.72 },
        { financialDate: "2026-08-17", totalStake: 110, payoutRatio: 0.68 },
      ],
      ChartKind.Composed,
      "Doanh thu + tỷ lệ trả thưởng",
    );

    // `%` (0-1) dùng chung trục với tiền (trăm triệu) sẽ thành vạch phẳng sát đáy — phải sang trục phải.
    expect(secondaryAxisKeys(model?.series ?? [])).toEqual(["payoutRatio"]);
  });

  it("cùng đơn vị dù lệch độ lớn thì KHÔNG tách trục — lệch đó là sự thật của dữ liệu", () => {
    const model = buildChartModel(DAILY_OVERVIEW_OUTPUT, undefined, "Tổng quan theo ngày");

    expect(secondaryAxisKeys(model?.series ?? [])).toEqual([]);
  });

  it("không có series → mảng rỗng, không nổ", () => {
    expect(secondaryAxisKeys([])).toEqual([]);
  });

  it("3 đơn vị: trục phải CHỈ nhận đơn vị thứ hai, đơn vị thứ ba ở lại trục trái", () => {
    // Một trục chỉ có 1 `tickFormatter` — nhồi cả `%` và số đếm vào trục phải thì số vé in ra dạng `%`.
    const series = [
      { dataKey: "totalStake", label: "Tiền cược", type: ChartFieldType.Currency },
      { dataKey: "payoutRatio", label: "Tỷ lệ trả thưởng", type: ChartFieldType.Percent },
      { dataKey: "entryCount", label: "Số vé", type: ChartFieldType.Number },
    ];

    expect(secondaryAxisKeys(series)).toEqual(["payoutRatio"]);
  });
});

describe("scatterAxisPair", () => {
  it("trục X là SỐ → X = chính field đó, Y = series đầu (không cần series thứ 2)", () => {
    const model = buildChartModel(
      [
        { records: 100, invocations: 4 },
        { records: 200, invocations: 9 },
        { records: 300, invocations: 15 },
      ],
      undefined,
      "Phân bố theo bucket",
    );

    const pair = scatterAxisPair(model as ChartModel);

    expect(pair?.x.dataKey).toBe("records");
    expect(pair?.y.dataKey).toBe("invocations");
    // Trục X CHÍNH LÀ field trục X của model ⇒ không có field nào bị mất ⇒ tooltip không cần dòng nhận diện.
    expect(pair?.identityKey).toBeUndefined();
  });

  it("trục X là thời gian → X = series 1, Y = series 2, ngày thành dòng nhận diện trong tooltip", () => {
    const model = buildChartModel(DAILY_OVERVIEW_OUTPUT, undefined, "Tổng quan theo ngày");

    const pair = scatterAxisPair(model as ChartModel);

    expect(pair?.x.dataKey).toBe("totalStake");
    expect(pair?.y.dataKey).toBe("totalWin");
    expect(pair?.identityKey).toBe("financialDate");
  });

  it("trục X phân loại + CHỈ 1 series → null, không vẽ series với chính nó thành đường chéo 45°", () => {
    const model = buildChartModel(
      [
        { gameProduct: "keno", totalStake: 100 },
        { gameProduct: "mega645", totalStake: 200 },
      ],
      undefined,
      "Doanh thu theo game",
    );

    expect(scatterAxisPair(model as ChartModel)).toBeNull();
  });
});
