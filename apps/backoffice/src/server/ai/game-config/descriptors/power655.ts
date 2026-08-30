/**
 * Descriptor Power 6/55 — dereference field thật của `GlobalConfigEntity` (p1-02 §3.2).
 *
 * Rename/xoá field ở entity làm ĐỎ COMPILE ngay tại đây — không phải test parse markdown.
 */

import type { GlobalConfigEntity } from "@megawin/game-power655-application/use-cases/game-config";
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
    item("play.unitPrice", "Giá 1 lần tham gia dự thưởng (1 bộ 6 số)", play.unitPrice, "vnd"),
    item("play.minBetCount", "Số lần cược tối thiểu / board", play.minBetCount, "count"),
    item("play.maxBetCount", "Số lần cược tối đa / board", play.maxBetCount, "count"),
    item(
      "play.maxBoardsPerTicket",
      "Số board (bảng) tối đa trên 1 vé",
      play.maxBoardsPerTicket,
      "count",
      "Giới hạn CẤU HÌNH, không phải trần cứng — đừng giả định vé chỉ có A-E. Tên board do client đặt, không phải hệ thống sinh.",
    ),
    item("play.maxDrawCount", "Số kỳ quay tối đa cho multi-draw", play.maxDrawCount, "count"),
    item("play.salesCloseBeforeMinutes", "Đóng bán trước giờ quay", play.salesCloseBeforeMinutes, "minutes"),
    item("play.drawsPerDay", "Số kỳ quay mỗi ngày", play.drawsPerDay, "count"),
    item("play.drawTimes", "Giờ quay trong ngày", play.drawTimes.join(", "), "text"),
    item(
      "play.drawDaysOfWeek",
      "Các ngày quay trong tuần",
      play.drawDaysOfWeek.map((d) => WEEKDAY_LABELS_FULL[d] ?? String(d)).join(", "),
      "text",
    ),
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
    item("rates.companyRate", "Tỷ lệ công ty thu về", rates.companyRate, "ratio"),
  ];
}

function describePrizes(c: GlobalConfigEntity): ConfigItem[] {
  const { defaultPrizes: p } = c;
  return [
    item("defaultPrizes.tier1", "Giải Nhất: trùng 5/6 số (không tính JP)", p.tier1, "vnd"),
    item("defaultPrizes.tier2", "Giải Nhì: trùng 4/6 số", p.tier2, "vnd"),
    item("defaultPrizes.tier3", "Giải Ba: trùng 3/6 số", p.tier3, "vnd"),
  ];
}

function describeJackpot(c: GlobalConfigEntity): ConfigItem[] {
  const { jackpot } = c;
  return [
    item(
      "jackpot.jackpot1.seedAmount",
      "Jackpot 1 (trùng 6/6): số tiền khởi điểm khi bắt đầu chu kỳ mới",
      jackpot.jackpot1.seedAmount,
      "vnd",
    ),
    item(
      "jackpot.jackpot2.seedAmount",
      "Jackpot 2 (trùng 5/6 + bonus): số tiền khởi điểm khi bắt đầu chu kỳ mới",
      jackpot.jackpot2.seedAmount,
      "vnd",
    ),
    item(
      "jackpot.jp1ContributionRatio",
      "Tỷ lệ JP1 nhận từ tổng tích luỹ mỗi kỳ",
      jackpot.jp1ContributionRatio,
      "ratio",
    ),
    item(
      "jackpot.jp2ContributionRatio",
      "Tỷ lệ JP2 nhận từ tổng tích luỹ mỗi kỳ",
      jackpot.jp2ContributionRatio,
      "ratio",
    ),
    item(
      "jackpot.jp1OverflowThreshold",
      "Ngưỡng JP1 tối đa — phần vượt chuyển sang JP2",
      jackpot.jp1OverflowThreshold,
      "vnd",
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
