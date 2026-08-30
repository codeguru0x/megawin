/**
 * Descriptor Mega 6/45 — dereference field thật của `GlobalConfigEntity` (p1-02 §3.2).
 *
 * Rename/xoá field ở entity làm ĐỎ COMPILE ngay tại đây — không phải test parse markdown.
 */

import type { GlobalConfigEntity } from "@megawin/game-mega645-application/use-cases/game-config";
import { WEEKDAY_LABELS_FULL } from "@megawin/shared/utils";

import { type ConfigItem, item } from "../../payload";
import { GameConfigSection } from "../types";

export const APPLICABLE_SECTIONS: readonly GameConfigSection[] = [
  GameConfigSection.Play,
  GameConfigSection.Rates,
  GameConfigSection.Prizes,
  GameConfigSection.Jackpot,
  GameConfigSection.Ops,
];

function describePlay(c: GlobalConfigEntity): ConfigItem[] {
  const { play } = c;
  return [
    item("play.unitPrice", "Đơn giá 1 line", play.unitPrice, "vnd"),
    item("play.minBetCount", "Số lần cược tối thiểu / board", play.minBetCount, "count"),
    item("play.maxBetCount", "Số lần cược tối đa / board", play.maxBetCount, "count"),
    item(
      "play.maxBoardsPerTicket",
      "Số board tối đa trên 1 vé",
      play.maxBoardsPerTicket,
      "count",
      "Giới hạn CẤU HÌNH, không phải trần cứng — đừng giả định vé chỉ có A-F. Tên board do client đặt, không phải hệ thống sinh.",
    ),
    item("play.maxDrawCount", "Số kỳ quay tối đa mà 1 vé tham gia liên tiếp", play.maxDrawCount, "count"),
    item("play.salesCloseBeforeMinutes", "Đóng bán trước giờ quay", play.salesCloseBeforeMinutes, "minutes"),
    item("play.drawsPerWeek", "Số kỳ quay mỗi tuần", play.drawsPerWeek, "count"),
    item(
      "play.drawDaysOfWeek",
      "Các ngày quay trong tuần",
      play.drawDaysOfWeek.map((d) => WEEKDAY_LABELS_FULL[d] ?? String(d)).join(", "),
      "text",
    ),
    item("play.drawTime", "Giờ quay", play.drawTime, "time"),
  ];
}

function describeRates(c: GlobalConfigEntity): ConfigItem[] {
  const { rates } = c;
  return [
    item(
      "rates.defaultCommissionRate",
      "Hoa hồng đại lý mặc định hệ thống",
      rates.defaultCommissionRate,
      "ratio",
      "Mặc định HỆ THỐNG — đại lý cụ thể có thể được override, KHÔNG dùng số này cho 1 đại lý cụ thể.",
    ),
    item("rates.companyRate", "Tỷ lệ thu nhập công ty trên tổng doanh thu", rates.companyRate, "ratio"),
  ];
}

function describePrizes(c: GlobalConfigEntity): ConfigItem[] {
  const { defaultPrizes: p } = c;
  return [
    item("defaultPrizes.tier1", "Giải Nhất: trùng 5/6 số", p.tier1, "vnd"),
    item("defaultPrizes.tier2", "Giải Nhì: trùng 4/6 số", p.tier2, "vnd"),
    item("defaultPrizes.tier3", "Giải Ba: trùng 3/6 số", p.tier3, "vnd"),
  ];
}

function describeJackpot(c: GlobalConfigEntity): ConfigItem[] {
  return [
    item(
      "jackpot.seedAmount",
      "Số tiền khởi điểm khi mở cycle Jackpot mới sau khi có người trúng",
      c.jackpot.seedAmount,
      "vnd",
      "Mega 6/45 theo luật Vietlott: Jackpot CHỈ tích luỹ (roll-over), KHÔNG có cơ chế chia giải xuống hạng dưới (khác Lotto 5/35).",
    ),
  ];
}

function describeOps(c: GlobalConfigEntity): ConfigItem[] {
  const { alerts } = c.ops;
  return [
    item("ops.alerts.largeBetAmount", "Ngưỡng cược lớn — cảnh báo vận hành", alerts.largeBetAmount, "vnd"),
    item(
      "ops.alerts.fixedExposureWarnAmount",
      "Ngưỡng exposure giải cố định (VND tuyệt đối) để cảnh báo",
      alerts.fixedExposureWarnAmount,
      "vnd",
    ),
    item(
      "ops.alerts.comboAccountsWarn",
      "Số account cùng 1 combo để cảnh báo dồn cược",
      alerts.comboAccountsWarn,
      "count",
    ),
    item("ops.alerts.baoHighStakeAmount", "Ngưỡng giá board Bao cao để cảnh báo", alerts.baoHighStakeAmount, "vnd"),
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
    case GameConfigSection.Jackpot:
      return describeJackpot(c);
    case GameConfigSection.Ops:
      return describeOps(c);
    default:
      return [];
  }
}
