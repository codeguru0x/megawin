/**
 * Game Core – Unit test: `calcSlotIndex` + `suggestVietlottPeriod`
 *
 * PURE — không DB, không cần quy tắc test staging chung.
 *
 * Số liệu thật dùng để verify: `.cursor/analysis/system-draw-result-auto-import.analysis.md`
 * §4.3 — Keno 27/08/2026: kỳ đầu ngày `#0293476` (06:08, slot 1), kỳ `07:04` (slot 8) = `#0293483`.
 * Dataset 3 ngày: 25/08 `#0293238→#0293356` (119 kỳ), 26/08 `#0293357→#0293475` (119 kỳ, bắc cầu
 * liên tục từ 25/08), 27/08 dở ngày `#0293476→#0293519`.
 */

import { toVNDate } from "@megawin/shared/utils";
import { describe, expect, it } from "vitest";

import {
  calcSlotIndex,
  slotIndexInDay,
  slotsPerDay,
  suggestVietlottPeriod,
  type VietlottDrawSchedule,
  type VietlottFixedTimesSchedule,
  type VietlottGridSchedule,
  VietlottSuggestionUnavailableReason,
} from "../../src/utils/vietlott-period";

// ─────────────────────────────────────────────
// Lịch dùng lại giữa các test
// ─────────────────────────────────────────────

/** Lịch Keno thật: lưới 8', 06:08 → 21:52 → 119 kỳ/ngày. */
const KENO_SCHEDULE: VietlottGridSchedule = {
  kind: "grid",
  firstDrawTime: "06:08",
  lastDrawTime: "21:52",
  intervalMinutes: 8,
};

/** Lịch Bingo18 thật: lưới 6', 06:06 → 21:53 (kỳ cuối thực tế 21:48) → 158 kỳ/ngày. */
const BINGO18_SCHEDULE: VietlottGridSchedule = {
  kind: "grid",
  firstDrawTime: "06:06",
  lastDrawTime: "21:53",
  intervalMinutes: 6,
};

/** Lịch Lotto535 (kiểu B): 2 giờ cố định mọi ngày. */
const LOTTO535_SCHEDULE: VietlottFixedTimesSchedule = {
  kind: "fixed_times",
  drawTimes: ["13:00", "21:00"],
};

/** Lịch kiểu C: chỉ quay Thứ 3 (2) / Thứ 5 (4) / Thứ 7 (6), mỗi ngày 1 giờ cố định. */
const WEEKLY_SCHEDULE: VietlottFixedTimesSchedule = {
  kind: "fixed_times",
  drawTimes: ["18:00"],
  drawDaysOfWeek: [2, 4, 6],
};

describe("slotsPerDay", () => {
  it("Đúng logic — Keno: (21:52-06:08)/8 + 1 = 119 kỳ/ngày (khớp dataset thật)", () => {
    expect(slotsPerDay("2026-08-27", KENO_SCHEDULE)).toBe(119);
  });

  it("Đúng logic — Bingo18: (21:53-06:06)/6 + 1 = 158 kỳ/ngày (KHÔNG phải 159)", () => {
    expect(slotsPerDay("2026-08-27", BINGO18_SCHEDULE)).toBe(158);
  });

  it("Đúng logic — kiểu B: slotsPerDay = drawTimes.length, mọi ngày (không filter thứ)", () => {
    expect(slotsPerDay("2026-08-27", LOTTO535_SCHEDULE)).toBe(2);
    // Chủ Nhật vẫn quay — kiểu B không có drawDaysOfWeek.
    expect(slotsPerDay("2026-08-30", LOTTO535_SCHEDULE)).toBe(2);
  });

  it("Đúng logic — kiểu C: ngày KHÔNG thuộc drawDaysOfWeek → 0 (không quay)", () => {
    // 2026-08-27 là Thứ Năm (4) → có quay.
    expect(slotsPerDay("2026-08-27", WEEKLY_SCHEDULE)).toBe(1);
    // 2026-08-28 là Thứ Sáu (5) → KHÔNG quay.
    expect(slotsPerDay("2026-08-28", WEEKLY_SCHEDULE)).toBe(0);
  });
});

describe("calcSlotIndex / slotIndexInDay", () => {
  it("Đúng logic — Keno 06:08 (kỳ đầu ngày) → slot 1", () => {
    const drawTime = toVNDate("2026-08-27", "06:08");
    expect(calcSlotIndex(drawTime, KENO_SCHEDULE)).toBe(1);
  });

  it("Đúng logic — Keno 07:04 → slot 8 (khớp dataset thật #0293483)", () => {
    const drawTime = toVNDate("2026-08-27", "07:04");
    expect(calcSlotIndex(drawTime, KENO_SCHEDULE)).toBe(8);
  });

  it("Đúng logic — Keno 21:52 (kỳ cuối ngày) → slot 119", () => {
    const drawTime = toVNDate("2026-08-27", "21:52");
    expect(calcSlotIndex(drawTime, KENO_SCHEDULE)).toBe(119);
  });

  it("Logic ngược — Keno 21:53 (vượt lastDrawTime dù đúng lưới) → null", () => {
    const drawTime = toVNDate("2026-08-27", "21:53");
    expect(calcSlotIndex(drawTime, KENO_SCHEDULE)).toBeNull();
  });

  it("Logic ngược — Keno 07:05 (lệch lưới 8') → null, KHÔNG làm tròn", () => {
    const drawTime = toVNDate("2026-08-27", "07:05");
    expect(calcSlotIndex(drawTime, KENO_SCHEDULE)).toBeNull();
  });

  it("Logic ngược — Keno 06:00 (trước firstDrawTime) → null", () => {
    const drawTime = toVNDate("2026-08-27", "06:00");
    expect(calcSlotIndex(drawTime, KENO_SCHEDULE)).toBeNull();
  });

  it("Đúng logic — Bingo18 21:48 (kỳ cuối thực tế) → slot 158", () => {
    const drawTime = toVNDate("2026-08-27", "21:48");
    expect(calcSlotIndex(drawTime, BINGO18_SCHEDULE)).toBe(158);
  });

  it("Đúng logic — kiểu B: 21:00 → slot 2 (đã sort drawTimes)", () => {
    expect(slotIndexInDay("21:00", "2026-08-27", LOTTO535_SCHEDULE)).toBe(2);
    expect(slotIndexInDay("13:00", "2026-08-27", LOTTO535_SCHEDULE)).toBe(1);
  });

  it("Logic ngược — kiểu B: giờ không thuộc drawTimes → null", () => {
    expect(slotIndexInDay("15:00", "2026-08-27", LOTTO535_SCHEDULE)).toBeNull();
  });

  it("Đúng logic — kiểu C: ngày quay đúng giờ → slot 1", () => {
    expect(slotIndexInDay("18:00", "2026-08-27", WEEKLY_SCHEDULE)).toBe(1);
  });

  it("Logic ngược — kiểu C: đúng giờ nhưng SAI ngày (không thuộc drawDaysOfWeek) → null", () => {
    expect(slotIndexInDay("18:00", "2026-08-28", WEEKLY_SCHEDULE)).toBeNull();
  });
});

describe("suggestVietlottPeriod — Keno, số liệu thật (analysis §4.3)", () => {
  it("Đúng logic — neo = kỳ đầu ngày (#0293476, 06:08) → suy đúng kỳ 07:04 = #0293483", () => {
    const result = suggestVietlottPeriod({
      target: { drawDate: "2026-08-27", drawTime: toVNDate("2026-08-27", "07:04") },
      anchor: { anchorDrawDate: "2026-08-27", anchorDrawTime: "06:08", anchorPeriod: "0293476" },
      schedule: KENO_SCHEDULE,
    });
    expect(result).toEqual({ suggestedPeriod: "0293483", reason: null });
  });

  it("Đúng logic — NEO LÀ KỲ GIỮA NGÀY (07:04/#0293483) → suy NGƯỢC đúng kỳ đầu ngày 06:08 = #0293476", () => {
    const result = suggestVietlottPeriod({
      target: { drawDate: "2026-08-27", drawTime: toVNDate("2026-08-27", "06:08") },
      anchor: { anchorDrawDate: "2026-08-27", anchorDrawTime: "07:04", anchorPeriod: "0293483" },
      schedule: KENO_SCHEDULE,
    });
    expect(result).toEqual({ suggestedPeriod: "0293476", reason: null });
  });

  it("Đúng logic — neo giữa ngày → suy đúng kỳ cuối ngày (21:52, slot 119) = #0293476 + 118", () => {
    const result = suggestVietlottPeriod({
      target: { drawDate: "2026-08-27", drawTime: toVNDate("2026-08-27", "21:52") },
      anchor: { anchorDrawDate: "2026-08-27", anchorDrawTime: "07:04", anchorPeriod: "0293483" },
      schedule: KENO_SCHEDULE,
    });
    // Kỳ cuối ngày = anchorPeriod của kỳ đầu ngày (0293476) + 118 = 0293594.
    expect(result).toEqual({ suggestedPeriod: "0293594", reason: null });
  });

  it("Đúng logic — BẮC CẦU QUA NGÀY: neo cuối ngày 26/08 (#0293475, slot 119) → kỳ đầu ngày 27/08 = #0293476", () => {
    const result = suggestVietlottPeriod({
      target: { drawDate: "2026-08-27", drawTime: toVNDate("2026-08-27", "06:08") },
      anchor: { anchorDrawDate: "2026-08-26", anchorDrawTime: "21:52", anchorPeriod: "0293475" },
      schedule: KENO_SCHEDULE,
    });
    expect(result).toEqual({ suggestedPeriod: "0293476", reason: null });
  });

  it("Đúng logic — BẮC CẦU 2 NGÀY: neo 25/08 kỳ đầu ngày (#0293238) → 27/08 kỳ đầu ngày = #0293476", () => {
    // 25/08: 119 kỳ (238→356), 26/08: 119 kỳ (357→475) → 27/08 kỳ 1 = 238 + 119 + 119 = 476.
    const result = suggestVietlottPeriod({
      target: { drawDate: "2026-08-27", drawTime: toVNDate("2026-08-27", "06:08") },
      anchor: { anchorDrawDate: "2026-08-25", anchorDrawTime: "06:08", anchorPeriod: "0293238" },
      schedule: KENO_SCHEDULE,
    });
    expect(result).toEqual({ suggestedPeriod: "0293476", reason: null });
  });

  it("Đúng logic — MỞ THIẾU KỲ: chỉ tạo 06:08/12:00/18:00, neo=06:08 → suy đúng 18:00 dù không tạo drawNo=2,3 liên tục (không phụ thuộc drawNo)", () => {
    // 18:00 = slot (18:00-06:08)/8 + 1 = (1080-368)/8+1 = 89+1 = 90 — đúng bằng ví dụ "lệch drawNo"
    // ở overview §3 (drawNo ta tạo=3, vị trí lưới thật=90). Kết quả suy = 0293476 + (90-1) = 0293565,
    // KHÔNG phụ thuộc việc ta chỉ tạo 3 draw (06:08/12:00/18:00) trong ngày.
    const result = suggestVietlottPeriod({
      target: { drawDate: "2026-08-27", drawTime: toVNDate("2026-08-27", "18:00") },
      anchor: { anchorDrawDate: "2026-08-27", anchorDrawTime: "06:08", anchorPeriod: "0293476" },
      schedule: KENO_SCHEDULE,
    });
    expect(result).toEqual({ suggestedPeriod: "0293565", reason: null });
  });

  it("Logic ngược — giờ quay lệch lưới (07:05) → null + reason OffGrid", () => {
    const result = suggestVietlottPeriod({
      target: { drawDate: "2026-08-27", drawTime: toVNDate("2026-08-27", "07:05") },
      anchor: { anchorDrawDate: "2026-08-27", anchorDrawTime: "06:08", anchorPeriod: "0293476" },
      schedule: KENO_SCHEDULE,
    });
    expect(result).toEqual({ suggestedPeriod: null, reason: VietlottSuggestionUnavailableReason.OffGrid });
  });

  it("Logic ngược — kỳ đích TRƯỚC ngày neo → null + reason BeforeAnchorDate (không suy ngược qua ngày)", () => {
    const result = suggestVietlottPeriod({
      target: { drawDate: "2026-08-26", drawTime: toVNDate("2026-08-26", "21:52") },
      anchor: { anchorDrawDate: "2026-08-27", anchorDrawTime: "06:08", anchorPeriod: "0293476" },
      schedule: KENO_SCHEDULE,
    });
    expect(result).toEqual({ suggestedPeriod: null, reason: VietlottSuggestionUnavailableReason.BeforeAnchorDate });
  });

  it("Logic ngược — CHƯA CẤU HÌNH NEO (anchor undefined) → null + reason NoAnchor", () => {
    const result = suggestVietlottPeriod({
      target: { drawDate: "2026-08-27", drawTime: toVNDate("2026-08-27", "06:08") },
      anchor: undefined,
      schedule: KENO_SCHEDULE,
    });
    expect(result).toEqual({ suggestedPeriod: null, reason: VietlottSuggestionUnavailableReason.NoAnchor });
  });

  it("Logic ngược — LỊCH ĐÃ ĐỔI SAU NGÀY NEO (neo 06:05 không còn khớp lưới 06:08+8') → null + reason ScheduleChangedSinceAnchor", () => {
    const result = suggestVietlottPeriod({
      target: { drawDate: "2026-08-27", drawTime: toVNDate("2026-08-27", "07:04") },
      anchor: { anchorDrawDate: "2026-08-20", anchorDrawTime: "06:05", anchorPeriod: "0293000" },
      schedule: KENO_SCHEDULE,
    });
    expect(result).toEqual({
      suggestedPeriod: null,
      reason: VietlottSuggestionUnavailableReason.ScheduleChangedSinceAnchor,
    });
  });

  it("Đúng logic — giữ zero-pad theo độ rộng anchorPeriod (7 chữ số)", () => {
    const result = suggestVietlottPeriod({
      target: { drawDate: "2026-08-27", drawTime: toVNDate("2026-08-27", "06:16") },
      anchor: { anchorDrawDate: "2026-08-27", anchorDrawTime: "06:08", anchorPeriod: "0000009" },
      schedule: KENO_SCHEDULE,
    });
    expect(result).toEqual({ suggestedPeriod: "0000010", reason: null });
  });
});

describe("suggestVietlottPeriod — Bingo18 (158 kỳ/ngày)", () => {
  it("Đúng logic — neo kỳ đầu ngày → suy đúng kỳ cuối ngày 21:48 (slot 158) = anchor + 157", () => {
    const result = suggestVietlottPeriod({
      target: { drawDate: "2026-08-24", drawTime: toVNDate("2026-08-24", "21:48") },
      anchor: { anchorDrawDate: "2026-08-24", anchorDrawTime: "06:06", anchorPeriod: "0183496" },
      schedule: BINGO18_SCHEDULE,
    });
    // Dataset đã verify (p2-bingo18.plan.md): 183496 → 183654 = 158 kỳ (chênh 158 vì slot cuối
    // = slot đầu + 157).
    expect(result).toEqual({ suggestedPeriod: "0183653", reason: null });
  });
});

describe("suggestVietlottPeriod — kiểu B (Lotto535) và kiểu C (theo thứ)", () => {
  it("Đúng logic — kiểu B: neo 13:00 → suy đúng 21:00 cùng ngày = anchor + 1", () => {
    const result = suggestVietlottPeriod({
      target: { drawDate: "2026-08-27", drawTime: toVNDate("2026-08-27", "21:00") },
      anchor: { anchorDrawDate: "2026-08-27", anchorDrawTime: "13:00", anchorPeriod: "00123" },
      schedule: LOTTO535_SCHEDULE,
    });
    expect(result).toEqual({ suggestedPeriod: "00124", reason: null });
  });

  it("Đúng logic — kiểu B: bắc cầu qua ngày, neo 21:00 hôm nay → 13:00 ngày mai = anchor + 1", () => {
    const result = suggestVietlottPeriod({
      target: { drawDate: "2026-08-28", drawTime: toVNDate("2026-08-28", "13:00") },
      anchor: { anchorDrawDate: "2026-08-27", anchorDrawTime: "21:00", anchorPeriod: "00124" },
      schedule: LOTTO535_SCHEDULE,
    });
    expect(result).toEqual({ suggestedPeriod: "00125", reason: null });
  });

  it("Đúng logic — kiểu C: neo Thứ Năm (27/08, 18:00) → suy đúng Thứ Bảy (29/08) BỎ QUA Thứ Sáu không quay", () => {
    // 27/08 (Thứ 5, có quay) → 28/08 (Thứ 6, KHÔNG quay, 0 slot) → 29/08 (Thứ 7, có quay, slot 1).
    const result = suggestVietlottPeriod({
      target: { drawDate: "2026-08-29", drawTime: toVNDate("2026-08-29", "18:00") },
      anchor: { anchorDrawDate: "2026-08-27", anchorDrawTime: "18:00", anchorPeriod: "00500" },
      schedule: WEEKLY_SCHEDULE,
    });
    // Ngày neo còn lại 0 slot (đã là slot cuối/duy nhất) + ngày giữa (28/08) 0 slot + slot đích 1 = delta 1.
    expect(result).toEqual({ suggestedPeriod: "00501", reason: null });
  });

  it("Logic ngược — kiểu C: kỳ đích rơi vào ngày không quay → null + reason OffGrid", () => {
    const result = suggestVietlottPeriod({
      target: { drawDate: "2026-08-28", drawTime: toVNDate("2026-08-28", "18:00") },
      anchor: { anchorDrawDate: "2026-08-27", anchorDrawTime: "18:00", anchorPeriod: "00500" },
      schedule: WEEKLY_SCHEDULE,
    });
    expect(result).toEqual({ suggestedPeriod: null, reason: VietlottSuggestionUnavailableReason.OffGrid });
  });
});

describe("suggestVietlottPeriod — biên slot đầu/cuối", () => {
  it("Đúng logic — Keno: neo slot cuối (21:52) → target slot đầu ngày SAU = anchor + 1", () => {
    const result = suggestVietlottPeriod({
      target: { drawDate: "2026-08-28", drawTime: toVNDate("2026-08-28", "06:08") },
      anchor: { anchorDrawDate: "2026-08-27", anchorDrawTime: "21:52", anchorPeriod: "0293594" },
      schedule: KENO_SCHEDULE,
    });
    expect(result).toEqual({ suggestedPeriod: "0293595", reason: null });
  });

  it("Đúng logic — Bingo18: neo slot đầu (06:06) → target slot cuối CÙNG NGÀY (21:48) = anchor + 157", () => {
    const result = suggestVietlottPeriod({
      target: { drawDate: "2026-08-24", drawTime: toVNDate("2026-08-24", "21:48") },
      anchor: { anchorDrawDate: "2026-08-24", anchorDrawTime: "06:06", anchorPeriod: "0000001" },
      schedule: BINGO18_SCHEDULE,
    });
    expect(result).toEqual({ suggestedPeriod: "0000158", reason: null });
  });
});

// ─────────────────────────────────────────────
// Kiểm thủ công P4 — 4 game slow (kiểu C), lịch quay THẬT theo p4-slow-games.plan.md
// Trọng tâm: bắc cầu qua NHIỀU ngày không quay liên tiếp (không phải chỉ 1 ngày như
// WEEKLY_SCHEDULE ở trên) + xác nhận Δperiod luôn = số NGÀY QUAY, không phải daysBetween.
// ─────────────────────────────────────────────

/** Lịch Mega645 thật: CN(0)/T4(3)/T6(5), 1 giờ quay 18:00. */
const MEGA645_SCHEDULE: VietlottFixedTimesSchedule = {
  kind: "fixed_times",
  drawTimes: ["18:00"],
  drawDaysOfWeek: [0, 3, 5],
};

/** Lịch Power655 thật: T3(2)/T5(4)/T7(6), 1 giờ quay 18:00. */
const POWER655_SCHEDULE: VietlottFixedTimesSchedule = {
  kind: "fixed_times",
  drawTimes: ["18:00"],
  drawDaysOfWeek: [2, 4, 6],
};

/** Lịch Max3D thật: T2(1)/T4(3)/T6(5), 1 giờ quay 18:00. */
const MAX3D_SCHEDULE: VietlottFixedTimesSchedule = {
  kind: "fixed_times",
  drawTimes: ["18:00"],
  drawDaysOfWeek: [1, 3, 5],
};

describe("suggestVietlottPeriod — P4 Mega645 (CN/T4/T6), bắc cầu nhiều ngày nghỉ liên tiếp", () => {
  it("Đúng logic — neo T6 (28/08, Thứ 6) → CN kế tiếp (30/08) BỎ QUA T7 (29/08, 1 ngày nghỉ) = anchor + 1", () => {
    const result = suggestVietlottPeriod({
      target: { drawDate: "2026-08-30", drawTime: toVNDate("2026-08-30", "18:00") },
      anchor: { anchorDrawDate: "2026-08-28", anchorDrawTime: "18:00", anchorPeriod: "01500" },
      schedule: MEGA645_SCHEDULE,
    });
    expect(result).toEqual({ suggestedPeriod: "01501", reason: null });
  });

  it("Đúng logic — neo CN (30/08) → T4 kế tiếp (02/09) BỎ QUA T2+T3 (2 ngày nghỉ liên tiếp) = anchor + 1", () => {
    const result = suggestVietlottPeriod({
      target: { drawDate: "2026-09-02", drawTime: toVNDate("2026-09-02", "18:00") },
      anchor: { anchorDrawDate: "2026-08-30", anchorDrawTime: "18:00", anchorPeriod: "01501" },
      schedule: MEGA645_SCHEDULE,
    });
    expect(result).toEqual({ suggestedPeriod: "01502", reason: null });
  });

  it("Đúng logic — neo T4 (26/08) → CN CÁCH 2 TUẦN SAU (13/09): đếm đúng 7 ngày quay ở giữa (T6 28/08, CN 30/08, T4 02/09, T6 04/09, CN 06/09, T4 09/09, T6 11/09) = anchor + 8", () => {
    // Ngày quay giữa 26/08 (T4, neo) và 13/09 (CN, đích), KHÔNG tính 2 đầu:
    // 28/08(T6), 30/08(CN), 02/09(T4), 04/09(T6), 06/09(CN), 09/09(T4), 11/09(T6) = 7 ngày quay giữa.
    // Δ = 7 (ngày giữa) + 1 (slot đích, vì mỗi ngày chỉ 1 slot) = 8.
    const result = suggestVietlottPeriod({
      target: { drawDate: "2026-09-13", drawTime: toVNDate("2026-09-13", "18:00") },
      anchor: { anchorDrawDate: "2026-08-26", anchorDrawTime: "18:00", anchorPeriod: "01490" },
      schedule: MEGA645_SCHEDULE,
    });
    expect(result).toEqual({ suggestedPeriod: "01498", reason: null });
  });

  it("Logic ngược — kỳ đích rơi vào ngày KHÔNG quay (T2, do sửa lịch tay) → null + reason OffGrid, KHÔNG trả period đoán bừa", () => {
    // 2026-08-31 là Thứ 2 — không thuộc [0,3,5].
    const result = suggestVietlottPeriod({
      target: { drawDate: "2026-08-31", drawTime: toVNDate("2026-08-31", "18:00") },
      anchor: { anchorDrawDate: "2026-08-28", anchorDrawTime: "18:00", anchorPeriod: "01500" },
      schedule: MEGA645_SCHEDULE,
    });
    expect(result).toEqual({ suggestedPeriod: null, reason: VietlottSuggestionUnavailableReason.OffGrid });
  });
});

describe("suggestVietlottPeriod — P4 Power655 (T3/T5/T7), bắc cầu qua Chủ Nhật + Thứ 2 (2 ngày nghỉ)", () => {
  it("Đúng logic — neo T7 (29/08) → T3 kế tiếp (01/09) BỎ QUA CN+T2 = anchor + 1", () => {
    const result = suggestVietlottPeriod({
      target: { drawDate: "2026-09-01", drawTime: toVNDate("2026-09-01", "18:00") },
      anchor: { anchorDrawDate: "2026-08-29", anchorDrawTime: "18:00", anchorPeriod: "01200" },
      schedule: POWER655_SCHEDULE,
    });
    expect(result).toEqual({ suggestedPeriod: "01201", reason: null });
  });

  it("Logic ngược — target date TRƯỚC anchor date (dù cùng là ngày quay hợp lệ) → null + reason BeforeAnchorDate (không suy ngược qua ranh giới ngày, chỉ same-day mới cho phép delta âm)", () => {
    // 25/08 (T3, ngày quay hợp lệ) nhưng NHỎ HƠN anchorDrawDate (27/08) → chặn tại check
    // đầu hàm, không đi tới nhánh tính slot — khác same-day (Keno test ở trên vẫn suy được).
    const result = suggestVietlottPeriod({
      target: { drawDate: "2026-08-25", drawTime: toVNDate("2026-08-25", "18:00") },
      anchor: { anchorDrawDate: "2026-08-27", anchorDrawTime: "18:00", anchorPeriod: "01199" },
      schedule: POWER655_SCHEDULE,
    });
    expect(result).toEqual({ suggestedPeriod: null, reason: VietlottSuggestionUnavailableReason.BeforeAnchorDate });
  });

  it("Đúng logic — neo cách 3 tuần trước (08/08, T7) → suy đúng kỳ 29/08 (T7): 9 ngày quay giữa × 1 slot = anchor + 9", () => {
    // Ngày quay giữa 08/08(T7,neo) và 29/08(T7,đích), không tính 2 đầu: 11/08(T3),13/08(T5),
    // 15/08(T7),18/08(T3),20/08(T5),22/08(T7),25/08(T3),27/08(T5) = 8 ngày + targetSlot 1 = 9.
    const result = suggestVietlottPeriod({
      target: { drawDate: "2026-08-29", drawTime: toVNDate("2026-08-29", "18:00") },
      anchor: { anchorDrawDate: "2026-08-08", anchorDrawTime: "18:00", anchorPeriod: "01191" },
      schedule: POWER655_SCHEDULE,
    });
    expect(result).toEqual({ suggestedPeriod: "01200", reason: null });
  });
});

describe("suggestVietlottPeriod — P4 Max3D (T2/T4/T6), bắc cầu qua T7+CN (2 ngày nghỉ, sang tuần mới)", () => {
  it("Đúng logic — neo T6 (28/08) → T2 tuần sau (31/08) BỎ QUA T7+CN = anchor + 1", () => {
    const result = suggestVietlottPeriod({
      target: { drawDate: "2026-08-31", drawTime: toVNDate("2026-08-31", "18:00") },
      anchor: { anchorDrawDate: "2026-08-28", anchorDrawTime: "18:00", anchorPeriod: "05000" },
      schedule: MAX3D_SCHEDULE,
    });
    expect(result).toEqual({ suggestedPeriod: "05001", reason: null });
  });

  it("Logic ngược — neo hết hạn theo lịch cũ: neo T2 08:00 (giờ khác 18:00 hiện tại) → null + reason ScheduleChangedSinceAnchor", () => {
    const result = suggestVietlottPeriod({
      target: { drawDate: "2026-08-31", drawTime: toVNDate("2026-08-31", "18:00") },
      anchor: { anchorDrawDate: "2026-08-24", anchorDrawTime: "08:00", anchorPeriod: "04990" },
      schedule: MAX3D_SCHEDULE,
    });
    expect(result).toEqual({
      suggestedPeriod: null,
      reason: VietlottSuggestionUnavailableReason.ScheduleChangedSinceAnchor,
    });
  });
});

describe("suggestVietlottPeriod — biên drawDaysOfWeek trống/undefined (P4 checklist: không treo vòng lặp)", () => {
  it("Không có infinite loop khi bắc cầu nhiều tháng dù drawDaysOfWeek chỉ có 1 ngày/tuần (7 ngày mới có 1 slot)", () => {
    const oneDayAWeek: VietlottFixedTimesSchedule = {
      kind: "fixed_times",
      drawTimes: ["18:00"],
      drawDaysOfWeek: [5], // chỉ Thứ 6.
    };
    const result = suggestVietlottPeriod({
      target: { drawDate: "2026-12-04", drawTime: toVNDate("2026-12-04", "18:00") }, // Thứ 6.
      anchor: { anchorDrawDate: "2026-08-28", anchorDrawTime: "18:00", anchorPeriod: "00001" }, // Thứ 6.
      schedule: oneDayAWeek,
    });
    // 28/08 → 04/12: 14 tuần đúng lịch → Δ = 14.
    expect(result).toEqual({ suggestedPeriod: "00015", reason: null });
  });

  it("Tài liệu hoá hành vi hiện tại — drawDaysOfWeek=[] được coi là 'quay mọi ngày' (kiểu B), KHÔNG phải 'không ngày nào'. An toàn vì Zod route.ts đã chặn `.min(1)` nên [] không thể lưu vào DB cho 4 game kiểu C (P4 checklist)", () => {
    const emptyDays: VietlottFixedTimesSchedule = {
      kind: "fixed_times",
      drawTimes: ["18:00"],
      drawDaysOfWeek: [],
    };
    expect(slotsPerDay("2026-08-31", emptyDays)).toBe(1); // KHÔNG phải 0.
  });
});

// Type-only reference để đảm bảo `VietlottDrawSchedule` (union) export đúng — nếu 2 shape trên
// không gán được vào union này, biên dịch sẽ báo lỗi ở đây trước khi chạy test.
const _scheduleUnionCheck: VietlottDrawSchedule[] = [
  KENO_SCHEDULE,
  LOTTO535_SCHEDULE,
  WEEKLY_SCHEDULE,
  MEGA645_SCHEDULE,
  POWER655_SCHEDULE,
  MAX3D_SCHEDULE,
];
void _scheduleUnionCheck;
