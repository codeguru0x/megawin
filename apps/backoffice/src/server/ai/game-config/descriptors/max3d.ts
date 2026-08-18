/**
 * Descriptor Max 3D — dereference field thật của `GlobalConfigEntity` (p1-02 §3.2).
 *
 * Rename/xoá field ở entity làm ĐỎ COMPILE ngay tại đây — không phải test parse markdown.
 */

import type { BasicPrizeAmounts } from "@megawin/game-max3d/entities";
import type { GlobalConfigEntity } from "@megawin/game-max3d-application/use-cases/game-config";

import { type ConfigItem, item } from "../../payload";
import { GameConfigSection } from "../types";

export const APPLICABLE_SECTIONS: readonly GameConfigSection[] = [
  GameConfigSection.Play,
  GameConfigSection.Rates,
  GameConfigSection.Prizes,
  GameConfigSection.Ops,
];

const DAY_OF_WEEK_LABEL: Record<number, string> = {
  0: "Chủ nhật",
  1: "Thứ Hai",
  2: "Thứ Ba",
  3: "Thứ Tư",
  4: "Thứ Năm",
  5: "Thứ Sáu",
  6: "Thứ Bảy",
};

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
      play.drawDaysOfWeek.map((d) => DAY_OF_WEEK_LABEL[d] ?? String(d)).join(", "),
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

function describeBasicTable(prefix: string, label: string, p: BasicPrizeAmounts): ConfigItem[] {
  return [
    item(`${prefix}.special`, `${label}: Giải Đặc biệt`, p.special, "vnd"),
    item(`${prefix}.first`, `${label}: Giải Nhất`, p.first, "vnd"),
    item(`${prefix}.second`, `${label}: Giải Nhì`, p.second, "vnd"),
    item(`${prefix}.third`, `${label}: Giải Ba`, p.third, "vnd"),
  ];
}

function describePrizes(c: GlobalConfigEntity): ConfigItem[] {
  const { defaultPrizes } = c;
  const { basic, combo, plus } = defaultPrizes;
  const p = plus;

  return [
    ...describeBasicTable("defaultPrizes.basic", "Max 3D Cơ bản (1 bộ ba số, straight)", basic),
    ...describeBasicTable("defaultPrizes.combo.combo3", "Max 3D Tổ hợp 3 (combo3)", combo.combo3),
    ...describeBasicTable("defaultPrizes.combo.combo6", "Max 3D Tổ hợp 6 (combo6)", combo.combo6),
    item("defaultPrizes.plus.special", "Max 3D+: Giải Đặc biệt (2 bộ ba số)", p.special, "vnd"),
    item("defaultPrizes.plus.first", "Max 3D+: Giải Nhất", p.first, "vnd"),
    item("defaultPrizes.plus.second", "Max 3D+: Giải Nhì", p.second, "vnd"),
    item("defaultPrizes.plus.third", "Max 3D+: Giải Ba", p.third, "vnd"),
    item("defaultPrizes.plus.fourth", "Max 3D+: Giải Tư", p.fourth, "vnd"),
    item("defaultPrizes.plus.fifth", "Max 3D+: Giải Năm", p.fifth, "vnd"),
    item("defaultPrizes.plus.sixth", "Max 3D+: Giải Sáu", p.sixth, "vnd"),
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
      "Ngưỡng liability đặc biệt của 1 cặp Max 3D+ để cảnh báo",
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
