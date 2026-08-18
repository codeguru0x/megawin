/**
 * Descriptor Lotto 5/35 — dereference field thật của `GlobalConfigEntity` (p1-02 §3.2).
 *
 * Rename/xoá field ở entity làm ĐỎ COMPILE ngay tại đây — không phải test parse markdown.
 */

import type { GlobalConfigEntity } from "@megawin/game-lotto535-application/use-cases/game-config";

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
    item("play.unitPrice", "Giá 1 line (bộ số con) cho 1 kỳ", play.unitPrice, "vnd"),
    item("play.minBetCount", "Số lần cược tối thiểu / board", play.minBetCount, "count"),
    item("play.maxBetCount", "Số lần cược tối đa / board", play.maxBetCount, "count"),
    item(
      "play.maxBoardsPerTicket",
      "Số board tối đa trên 1 vé",
      play.maxBoardsPerTicket,
      "count",
      "Giới hạn CẤU HÌNH, không phải trần cứng — đừng giả định vé chỉ có A-E. Tên board do client đặt, không phải hệ thống sinh.",
    ),
    item("play.maxDrawCount", "Số kỳ liên tiếp tối đa (KY)", play.maxDrawCount, "count"),
    item("play.salesCloseBeforeMinutes", "Đóng bán trước giờ quay", play.salesCloseBeforeMinutes, "minutes"),
    item("play.drawsPerDay", "Số kỳ quay mỗi ngày", play.drawsPerDay, "count"),
    item(
      "play.drawTimes",
      "Giờ quay trong ngày (mỗi kỳ)",
      play.drawTimes.join(", "),
      "text",
      "Kỳ CUỐI trong danh sách này là kỳ chia giải Jackpot (split cycle) — xác định theo thứ tự trong giá trị trả về, KHÔNG theo giờ cụ thể nào.",
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
    item("rates.companyRate", "Tỷ lệ công ty thu về trên doanh thu", rates.companyRate, "ratio"),
  ];
}

function describePrizes(c: GlobalConfigEntity): ConfigItem[] {
  const { defaultPrizes: p } = c;
  return [
    item("defaultPrizes.tier1", "Giải Nhất: trùng 5 số chính (chưa gồm Jackpot)", p.tier1, "vnd"),
    item("defaultPrizes.tier2", "Giải Nhì: 4 chính + đặc biệt", p.tier2, "vnd"),
    item("defaultPrizes.tier3", "Giải Ba: 4 chính", p.tier3, "vnd"),
    item("defaultPrizes.tier4", "Giải Tư: 3 chính + đặc biệt", p.tier4, "vnd"),
    item("defaultPrizes.tier5", "Giải Năm: 3 chính", p.tier5, "vnd"),
    item("defaultPrizes.consolation", "Giải Khuyến khích: chỉ trùng số đặc biệt", p.consolation, "vnd"),
  ];
}

function describeJackpot(c: GlobalConfigEntity): ConfigItem[] {
  const { jackpot } = c;
  return [
    item(
      "jackpot.seedAmount",
      "Số tiền khởi điểm khi mở kỳ Jackpot mới",
      jackpot.seedAmount,
      "vnd",
      "Dùng làm giá trị Jackpot tối thiểu ngay sau khi có người trúng và cycle mới bắt đầu.",
    ),
    item(
      "jackpot.splitThreshold",
      "Ngưỡng kích hoạt chia Jackpot",
      jackpot.splitThreshold,
      "vnd",
      "Khi Jackpot tích luỹ đạt ngưỡng này mà chưa có ai trúng 5 chính + ĐB, kỳ quay tối (Evening) sẽ CHIA giải xuống tier1-5.",
    ),
    item("jackpot.splitRatios.tier1", "Tỷ lệ phần chia Jackpot cho Giải Nhất", jackpot.splitRatios.tier1, "ratio"),
    item("jackpot.splitRatios.tier2", "Tỷ lệ phần chia Jackpot cho Giải Nhì", jackpot.splitRatios.tier2, "ratio"),
    item("jackpot.splitRatios.tier3", "Tỷ lệ phần chia Jackpot cho Giải Ba", jackpot.splitRatios.tier3, "ratio"),
    item("jackpot.splitRatios.tier4", "Tỷ lệ phần chia Jackpot cho Giải Tư", jackpot.splitRatios.tier4, "ratio"),
    item("jackpot.splitRatios.tier5", "Tỷ lệ phần chia Jackpot cho Giải Năm", jackpot.splitRatios.tier5, "ratio"),
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
    item(
      "ops.alerts.coverHighStakeAmount",
      "Ngưỡng giá board mainCover cao để cảnh báo",
      alerts.coverHighStakeAmount,
      "vnd",
    ),
    item(
      "ops.alerts.specialSkewRatio",
      "Tỷ trọng tối đa 1 số đặc biệt được chiếm trước khi cảnh báo lệch",
      alerts.specialSkewRatio,
      "ratio",
    ),
    item(
      "ops.alerts.specialSkewMinAmount",
      "Tổng tiền cược đặc biệt tối thiểu để rule lệch có nghĩa",
      alerts.specialSkewMinAmount,
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
    case GameConfigSection.Jackpot:
      return describeJackpot(c);
    case GameConfigSection.Ops:
      return describeOps(c);
    default:
      return [];
  }
}
