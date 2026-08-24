/**
 * Unit test `chart-format.ts` — case đúng như checklist §7.1 kế hoạch p1-05-chart-generative-ui.
 */

import { describe, expect, it } from "vitest";

import {
  ChartFieldType,
  formatAxisTick,
  formatTimeAxisTick,
  formatTimeTooltip,
  formatTooltipValue,
  formatXAxisTick,
  prettifyLabel,
  truncateLabel,
} from "@/lib/chart";

describe("formatAxisTick", () => {
  it("currency/number compact K/M/B — không bao giờ hiện số đầy đủ", () => {
    expect(formatAxisTick(12_345_000_000, ChartFieldType.Currency)).toBe("12.3B");
    expect(formatAxisTick(1_500_000, ChartFieldType.Currency)).toBe("1.5M");
    expect(formatAxisTick(950, ChartFieldType.Number)).toBe("950");
  });

  it("số âm giữ dấu trừ trước suffix", () => {
    expect(formatAxisTick(-2_500_000, ChartFieldType.Currency)).toBe("-2.5M");
  });

  it("percent dùng formatPercent, không compact", () => {
    expect(formatAxisTick(72.5, ChartFieldType.Percent)).toBe("73%");
  });
});

describe("formatTooltipValue", () => {
  it("currency hiện đầy đủ kèm ₫", () => {
    expect(formatTooltipValue(1_234_567, ChartFieldType.Currency)).toBe("1,234,567 ₫");
  });

  it("number hiện đầy đủ grouped, không đơn vị", () => {
    expect(formatTooltipValue(1_234_567, ChartFieldType.Number)).toBe("1,234,567");
  });

  it("percent 1 chữ số thập phân", () => {
    expect(formatTooltipValue(72.5, ChartFieldType.Percent)).toBe("72.5%");
  });
});

describe("formatTimeAxisTick", () => {
  const sameYearNow = new Date("2026-08-19T00:00:00Z");

  it("ISO date cùng năm hiện tại → dd/MM", () => {
    expect(formatTimeAxisTick("2026-08-16", sameYearNow)).toBe("16/08");
  });

  it("ISO datetime cùng năm → dd/MM (bỏ phần time)", () => {
    expect(formatTimeAxisTick("2026-08-16T07:12:00.000Z", sameYearNow)).toBe("16/08");
  });

  it("ISO date khác năm hiện tại → dd/MM/yy", () => {
    expect(formatTimeAxisTick("2025-08-16", sameYearNow)).toBe("16/08/25");
  });

  it("drawId YYYY-MM-DD.NNN → #NNN", () => {
    expect(formatTimeAxisTick("2026-08-16.095", sameYearNow)).toBe("#095");
  });

  it("giá trị không parse được → trả nguyên giá trị", () => {
    expect(formatTimeAxisTick("không phải ngày", sameYearNow)).toBe("không phải ngày");
  });
});

describe("formatTimeTooltip", () => {
  it("ISO date → dd/MM/YYYY đầy đủ", () => {
    expect(formatTimeTooltip("2026-08-16")).toBe("16/08/2026");
  });

  it("drawId → 'Kỳ YYYY-MM-DD.NNN'", () => {
    expect(formatTimeTooltip("2026-08-16.095")).toBe("Kỳ 2026-08-16.095");
  });
});

describe("truncateLabel", () => {
  it("giữ nguyên nhãn ngắn hơn hoặc bằng maxLength", () => {
    expect(truncateLabel("Keno")).toBe("Keno");
  });

  it("cắt nhãn dài hơn 12 ký tự, thêm …", () => {
    const result = truncateLabel("Công ty Cổ phần ABC Holdings");
    expect(result.endsWith("…")).toBe(true);
    expect(result.length).toBeLessThanOrEqual(13);
  });

  it("cắt đúng độ dài tuỳ chỉnh", () => {
    expect(truncateLabel("keno-super-long-name", 6)).toBe("keno-s…");
  });
});

describe("prettifyLabel", () => {
  it("ưu tiên reportLabels (REPORT_COLUMN_LABELS) nếu có", () => {
    expect(prettifyLabel("totalStake", { totalStake: "Tiền cược" })).toBe("Tiền cược");
  });

  it("fallback sang từ điển bổ sung của chart khi reportLabels không có key", () => {
    expect(prettifyLabel("gameProduct")).toBe("Game");
    expect(prettifyLabel("payoutRatio")).toBe("Tỷ lệ trả thưởng");
  });

  // Sentence case (không Title Case): nhãn cột phải đọc như tiếng Việt trong bảng backoffice
  // (`Doanh thu`, không `Doanh Thu`) — xem `humanizeKey`. Acronym giữ nguyên hoa.
  it("fallback cuối cùng: humanize camelCase → sentence case rời chữ, giữ hoa acronym", () => {
    expect(prettifyLabel("averageBetSize")).toBe("Average bet size");
    expect(prettifyLabel("doanhThu")).toBe("Doanh thu");
    expect(prettifyLabel("tongGGR")).toBe("Tong GGR");
  });
});

describe("formatXAxisTick", () => {
  it("dispatch đúng theo type: time → dd/MM, category → truncate", () => {
    expect(formatXAxisTick("2026-08-16", ChartFieldType.Time, new Date("2026-08-19"))).toBe("16/08");
    expect(formatXAxisTick("Công ty Cổ phần ABC Holdings", ChartFieldType.Category)).toContain("…");
  });
});
