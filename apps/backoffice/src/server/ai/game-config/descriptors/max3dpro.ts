/**
 * Descriptor Max 3D Pro — dereference field thật của `GlobalConfigEntity` (p1-02 §3.2).
 *
 * Rename/xoá field ở entity làm ĐỎ COMPILE ngay tại đây — không phải test parse markdown.
 */

import type { GlobalConfigEntity } from "@megawin/game-max3dpro-application/use-cases/game-config";
import { WEEKDAY_LABELS_FULL } from "@megawin/shared/utils";

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
    item("play.minBetCount", "Số lần cược tối thiểu / board", play.minBetCount, "count"),
    item("play.maxBetCount", "Số lần cược tối đa / board", play.maxBetCount, "count"),
    item("play.maxBoardsPerTicket", "Số board tối đa trên 1 vé", play.maxBoardsPerTicket, "count"),
    item("play.maxDrawCount", "Số kỳ liên tiếp tối đa", play.maxDrawCount, "count"),
    item("play.salesCloseBeforeMinutes", "Đóng bán trước giờ quay", play.salesCloseBeforeMinutes, "minutes"),
    item("play.drawsPerDay", "Số kỳ quay mỗi ngày", play.drawsPerDay, "count"),
    item("play.drawTimes", "Giờ quay trong ngày", play.drawTimes.join(", "), "text"),
    item(
      "play.drawDaysOfWeek",
      "Các ngày trong tuần được phép quay",
      play.drawDaysOfWeek.map((d) => WEEKDAY_LABELS_FULL[d] ?? String(d)).join(", "),
      "text",
      "Trả lời theo ĐÚNG giá trị này, không theo thể lệ Vietlott hay ký ức — vận hành đổi lịch quay được.",
    ),
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
  const { standard: p } = c.defaultPrizes;
  return [
    item("defaultPrizes.standard.special", "Giải Đặc biệt (2 bộ ba số khác nhau)", p.special, "vnd"),
    item("defaultPrizes.standard.specialSub", "Giải Phụ Đặc biệt", p.specialSub, "vnd"),
    item("defaultPrizes.standard.first", "Giải Nhất", p.first, "vnd"),
    item("defaultPrizes.standard.second", "Giải Nhì", p.second, "vnd"),
    item("defaultPrizes.standard.third", "Giải Ba", p.third, "vnd"),
    item("defaultPrizes.standard.fourth", "Giải Tư", p.fourth, "vnd"),
    item("defaultPrizes.standard.fifth", "Giải Năm", p.fifth, "vnd"),
    item(
      "defaultPrizes.standard.sixth",
      "Giải Sáu",
      p.sixth,
      "vnd",
      "Bảng trên áp dụng cho vé gồm 2 bộ ba số KHÁC NHAU. Nếu 2 bộ giống nhau, giải thưởng nhân đôi (từ Nhất đến Sáu), bằng tổng giá trị giải ĐB và phụ ĐB cho hạng ĐB/phụ ĐB.",
    ),
  ];
}

function describeOps(c: GlobalConfigEntity): ConfigItem[] {
  const { alerts } = c.ops;
  return [
    item("ops.alerts.largeBetAmount", "Ngưỡng cược lớn — cảnh báo vận hành", alerts.largeBetAmount, "vnd"),
    item(
      "ops.alerts.exposureWarnAmount",
      "Ngưỡng worst-case tổng (VND tuyệt đối) để cảnh báo exposure",
      alerts.exposureWarnAmount,
      "vnd",
    ),
    item(
      "ops.alerts.pairLiabilityWarnAmount",
      "Ngưỡng liability đặc biệt của 1 cặp để cảnh báo",
      alerts.pairLiabilityWarnAmount,
      "vnd",
    ),
    item(
      "ops.alerts.comboAccountsWarn",
      "Số account cùng 1 cặp để cảnh báo dồn cược",
      alerts.comboAccountsWarn,
      "count",
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
