/**
 * Descriptor Keno — dereference field thật của `GlobalConfigEntity` (p1-02 §3.2).
 *
 * Rename/xoá field ở entity làm ĐỎ COMPILE ngay tại đây — không phải test parse markdown.
 * `basicPrizes` là ma trận `pick{N} × matchCount` (~60 dòng nếu liệt kê hết) → CHỈ trả toàn bảng
 * khi caller truyền `pickSize`; không có `pickSize` thì trả hướng dẫn thay vì nổ token (§3.3).
 */

import type { GlobalConfigEntity } from "@megawin/game-keno-application/use-cases/game-config";

import { type ConfigItem, item } from "../../payload";
import { GameConfigSection } from "../types";

/** Section mà Keno CÓ — dùng để tính `sectionsNotApplicable` ở use-case dispatch. */
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
    item("play.maxDrawCount", "Số kỳ liên tiếp tối đa cho 1 vé", play.maxDrawCount, "count"),
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
      "Đây là mặc định HỆ THỐNG. Đại lý cụ thể có thể được override — KHÔNG dùng số này cho câu hỏi về 1 đại lý.",
    ),
  ];
}

/** `basicPrizes["pickN"]["matchCount"]` → item cho từng mốc trùng số, sort theo matchCount tăng dần. */
function describeBasicPrizesForPick(c: GlobalConfigEntity, pickSize: number): ConfigItem[] {
  const key = `pick${pickSize}`;
  const table = c.basicPrizes[key];
  if (table === undefined) {
    return [item(`basicPrizes.${key}`, `Bảng giải pick${pickSize}`, "không tồn tại", "text", "pickSize hợp lệ: 1-10.")];
  }
  return Object.entries(table)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([matchCount, amount]) =>
      item(
        `basicPrizes.${key}.${matchCount}`,
        `Pick ${pickSize}, trùng ${matchCount}/${pickSize} số`,
        amount,
        "vnd",
        Number(pickSize) >= 8
          ? "Bậc cao (8/9/10) có trần payoutCaps — có thể bị hạ so với giá cố định này khi số bộ trúng vượt ngưỡng. Xem mục payoutCaps."
          : undefined,
      ),
    );
}

function describePrizes(c: GlobalConfigEntity, pickSize?: number): ConfigItem[] {
  const items: ConfigItem[] = [];

  if (pickSize === undefined) {
    items.push(
      item(
        "basicPrizes",
        "Bảng giải cách chơi cơ bản (theo pick size)",
        "cần truyền pickSize (1-10) để lấy đúng bảng",
        "text",
        "Bảng đầy đủ 10 pick size quá dài — gọi lại getGameConfig với pickSize tương ứng câu hỏi.",
      ),
    );
  } else {
    items.push(...describeBasicPrizesForPick(c, pickSize));
  }

  const { bigSmallPrizes, evenOddPrizes, payoutCaps } = c;
  items.push(
    item("bigSmallPrizes.big13Plus", "Lớn: từ 13 số (41-80) trở lên", bigSmallPrizes.big13Plus, "vnd"),
    item("bigSmallPrizes.big1112", "Lớn: 11 hoặc 12 số (41-80)", bigSmallPrizes.big1112, "vnd"),
    item("bigSmallPrizes.draw", "Hoà Lớn/Nhỏ: 10-10", bigSmallPrizes.draw, "vnd"),
    item("bigSmallPrizes.small1112", "Nhỏ: 11 hoặc 12 số (01-40)", bigSmallPrizes.small1112, "vnd"),
    item("bigSmallPrizes.small13Plus", "Nhỏ: từ 13 số (01-40) trở lên", bigSmallPrizes.small13Plus, "vnd"),
    item("evenOddPrizes.even15Plus", "Chẵn: từ 15 số chẵn trở lên", evenOddPrizes.even15Plus, "vnd"),
    item("evenOddPrizes.even1314", "Chẵn: 13 hoặc 14 số chẵn", evenOddPrizes.even1314, "vnd"),
    item("evenOddPrizes.even1112", "Chẵn: 11 hoặc 12 số chẵn", evenOddPrizes.even1112, "vnd"),
    item("evenOddPrizes.draw", "Hoà Chẵn/Lẻ: 10-10", evenOddPrizes.draw, "vnd"),
    item("evenOddPrizes.odd1112", "Lẻ: 11 hoặc 12 số lẻ", evenOddPrizes.odd1112, "vnd"),
    item("evenOddPrizes.odd1314", "Lẻ: 13 hoặc 14 số lẻ", evenOddPrizes.odd1314, "vnd"),
    item("evenOddPrizes.odd15Plus", "Lẻ: từ 15 số lẻ trở lên", evenOddPrizes.odd15Plus, "vnd"),
    item(
      "payoutCaps.pick8MaxPerDraw",
      "Trần tổng trả thưởng bậc trùng 8/8 mỗi kỳ",
      payoutCaps.pick8MaxPerDraw,
      "vnd",
      "Khi số bộ trúng vượt pick8MaxSetsForFixed, pool này chia đều cho tất cả bộ trúng thay vì trả giá cố định.",
    ),
    item(
      "payoutCaps.pick8MaxSetsForFixed",
      "Ngưỡng số bộ trúng 8/8 còn được trả giá cố định",
      payoutCaps.pick8MaxSetsForFixed,
      "count",
    ),
    item("payoutCaps.pick9MaxPerDraw", "Trần tổng trả thưởng bậc trùng 9/9 mỗi kỳ", payoutCaps.pick9MaxPerDraw, "vnd"),
    item(
      "payoutCaps.pick9MaxSetsForFixed",
      "Ngưỡng số bộ trúng 9/9 còn được trả giá cố định",
      payoutCaps.pick9MaxSetsForFixed,
      "count",
    ),
    item(
      "payoutCaps.pick10MaxPerDraw",
      "Trần tổng trả thưởng bậc trùng 10/10 mỗi kỳ",
      payoutCaps.pick10MaxPerDraw,
      "vnd",
    ),
    item(
      "payoutCaps.pick10MaxSetsForFixed",
      "Ngưỡng số bộ trúng 10/10 còn được trả giá cố định",
      payoutCaps.pick10MaxSetsForFixed,
      "count",
    ),
  );

  return items;
}

function describeOps(c: GlobalConfigEntity): ConfigItem[] {
  const { alerts } = c.ops;
  return [
    item("ops.alerts.largeBetAmount", "Ngưỡng cược lớn — cảnh báo vận hành", alerts.largeBetAmount, "vnd"),
    item(
      "ops.alerts.exposureWarnPct",
      "Ngưỡng % cap chạm để cảnh báo exposure",
      alerts.exposureWarnPct,
      "ratio",
      "Giá trị này lưu theo thang 0-100 (%), KHÔNG phải 0-1 như các ratio khác — đọc đúng nguyên giá trị, không ×100 lần nữa.",
    ),
    item(
      "ops.alerts.sidebetSkewPct",
      "Ngưỡng % lệch 1 hướng sidebet để cảnh báo",
      alerts.sidebetSkewPct,
      "ratio",
      "Giá trị này lưu theo thang 0-100 (%), KHÔNG phải 0-1.",
    ),
    item(
      "ops.alerts.comboAccountsWarn",
      "Số account cùng 1 combo để cảnh báo dồn cược",
      alerts.comboAccountsWarn,
      "count",
    ),
  ];
}

/**
 * Dispatch section → mô tả cho Keno. `pickSize` chỉ dùng bởi {@link GameConfigSection.Prizes}.
 */
export function describe(c: GlobalConfigEntity, section: GameConfigSection, pickSize?: number): ConfigItem[] {
  switch (section) {
    case GameConfigSection.Play:
      return describePlay(c);
    case GameConfigSection.Rates:
      return describeRates(c);
    case GameConfigSection.Prizes:
      return describePrizes(c, pickSize);
    case GameConfigSection.Ops:
      return describeOps(c);
    case GameConfigSection.Jackpot:
      return [];
    default:
      return [];
  }
}
