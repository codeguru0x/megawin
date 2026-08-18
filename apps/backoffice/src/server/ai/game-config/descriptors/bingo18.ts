/**
 * Descriptor Bingo 18 — dereference field thật của `GlobalConfigEntity` (p1-02 §3.2).
 *
 * Rename/xoá field ở entity làm ĐỎ COMPILE ngay tại đây — không phải test parse markdown.
 */

import type { GlobalConfigEntity } from "@megawin/game-bingo18-application/use-cases/game-config";

import { type ConfigItem, item } from "../../payload";
import { GameConfigSection } from "../types";

export const APPLICABLE_SECTIONS: readonly GameConfigSection[] = [
  GameConfigSection.Play,
  GameConfigSection.Rates,
  GameConfigSection.Prizes,
  GameConfigSection.Ops,
];

function describePlay(c: GlobalConfigEntity): ConfigItem[] {
  const { play } = c;
  return [
    item("play.unitPrice", "Mệnh giá 1 lần tham gia dự thưởng", play.unitPrice, "vnd"),
    item("play.minBetCount", "Số lần cược tối thiểu / board hoặc sideBet", play.minBetCount, "count"),
    item("play.maxBetCount", "Số lần cược tối đa / board hoặc sideBet", play.maxBetCount, "count"),
    item("play.maxBasicBoardsPerTicket", "Số board cơ bản tối đa trên 1 vé", play.maxBasicBoardsPerTicket, "count"),
    item("play.maxDrawCount", "Số kỳ liên tiếp tối đa", play.maxDrawCount, "count"),
    item("play.salesCloseBeforeSeconds", "Đóng bán trước giờ quay", play.salesCloseBeforeSeconds, "seconds"),
    item("play.drawIntervalMinutes", "Khoảng cách giữa các kỳ quay", play.drawIntervalMinutes, "minutes"),
    item("play.firstDrawTime", "Giờ quay đầu tiên trong ngày", play.firstDrawTime, "time"),
    item("play.lastDrawTime", "Giờ quay cuối cùng trong ngày", play.lastDrawTime, "time"),
    item("play.timezone", "Timezone vận hành", play.timezone, "timezone"),
  ];
}

function describeRates(c: GlobalConfigEntity): ConfigItem[] {
  return [
    item(
      "rates.defaultCommissionRate",
      "Hoa hồng đại lý mặc định hệ thống",
      c.rates.defaultCommissionRate,
      "ratio",
      "Mặc định HỆ THỐNG — đại lý cụ thể có thể được override, KHÔNG dùng số này cho 1 đại lý cụ thể.",
    ),
  ];
}

function describePrizes(c: GlobalConfigEntity): ConfigItem[] {
  const { singleNumPrizes, doubleMatchPrizes, tripleMatchPrizes, sumTotalPrizes, bigSmallDrawPrizes } = c;

  const sumTotalItems = Object.entries(sumTotalPrizes)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([sum, amount]) =>
      item(
        `sumTotalPrizes.${sum}`,
        `Cộng tổng = ${sum}`,
        amount,
        "vnd",
        sum === "3" || sum === "18"
          ? "Tổng biên (3 hoặc 18) — xác suất thấp nhất, hệ số nhân giải cao nhất."
          : undefined,
      ),
    );

  return [
    item("singleNumPrizes.match1", "Một số: trúng 1 lần trong 3 số quay", singleNumPrizes.match1, "vnd"),
    item("singleNumPrizes.match2", "Một số: trúng 2 lần trong 3 số quay", singleNumPrizes.match2, "vnd"),
    item("singleNumPrizes.match3", "Một số: trúng cả 3 lần", singleNumPrizes.match3, "vnd"),
    item(
      "doubleMatchPrizes.win",
      "Hai số trùng nhau: thắng khi ≥2/3 số quay trùng số đã chọn",
      doubleMatchPrizes.win,
      "vnd",
    ),
    item(
      "tripleMatchPrizes.specific",
      "Ba số trùng nhau — cụ thể: cả 3 số quay đều trùng số đã chọn",
      tripleMatchPrizes.specific,
      "vnd",
    ),
    item(
      "tripleMatchPrizes.any",
      "Ba số trùng nhau — bất kỳ: cả 3 số quay giống nhau (bất kể số nào)",
      tripleMatchPrizes.any,
      "vnd",
    ),
    ...sumTotalItems,
    item("bigSmallDrawPrizes.big", "Lớn: tổng 3 số quay từ 12-18", bigSmallDrawPrizes.big, "vnd"),
    item("bigSmallDrawPrizes.draw", "Hòa: tổng 3 số quay = 10 hoặc 11", bigSmallDrawPrizes.draw, "vnd"),
    item("bigSmallDrawPrizes.small", "Nhỏ: tổng 3 số quay từ 3-9", bigSmallDrawPrizes.small, "vnd"),
  ];
}

function describeOps(c: GlobalConfigEntity): ConfigItem[] {
  const { alerts } = c.ops;
  return [
    item("ops.alerts.largeBetAmount", "Ngưỡng cược lớn — cảnh báo vận hành", alerts.largeBetAmount, "vnd"),
    item(
      "ops.alerts.exposureWarnRevenuePct",
      "Ngưỡng % doanh thu kỳ để cảnh báo exposure (worst-case ≥ pct% doanh thu)",
      alerts.exposureWarnRevenuePct,
      "ratio",
      "Giá trị lưu theo thang %, ví dụ 300 = worst-case gấp 3 lần doanh thu — KHÔNG phải thang 0-1.",
    ),
    item(
      "ops.alerts.exposureWarnMinAmount",
      "Sàn tuyệt đối — dưới mức này KHÔNG cảnh báo dù vượt % doanh thu",
      alerts.exposureWarnMinAmount,
      "vnd",
    ),
    item(
      "ops.alerts.sidebetSkewPct",
      "Ngưỡng % lệch 1 hướng Lớn/Hòa/Nhỏ để cảnh báo",
      alerts.sidebetSkewPct,
      "ratio",
      "Giá trị lưu theo thang % — KHÔNG phải thang 0-1.",
    ),
    item(
      "ops.alerts.bucketConcentrationAmount",
      "Ngưỡng tiền dồn vào 1 bucket nhân cao (sumTotal 3/18, tripleMatch specific) để cảnh báo",
      alerts.bucketConcentrationAmount,
      "vnd",
    ),
  ];
}

export function describe(c: GlobalConfigEntity, section: GameConfigSection): ConfigItem[] {
  switch (section) {
    case GameConfigSection.Play:
      return describePlay(c);
    case GameConfigSection.Rates:
      return describeRates(c);
    case GameConfigSection.Prizes:
      return describePrizes(c);
    case GameConfigSection.Ops:
      return describeOps(c);
    default:
      return [];
  }
}
