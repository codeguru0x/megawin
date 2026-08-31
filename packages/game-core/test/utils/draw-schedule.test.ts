/**
 * Game Core – Draw Schedule Helpers
 *
 * PURE — không DB, không cần quy tắc test staging chung.
 *
 * Config dùng làm mốc trong file này là default thật của 2 game quay nhanh
 * (`DEFAULT_KENO_CONFIG.play` / `DEFAULT_BINGO18_CONFIG.play`) — hardcode lại ở đây thay vì
 * import để test không phụ thuộc package game (game-core nằm DƯỚI chúng trong đồ thị phụ
 * thuộc). Nếu default của game đổi, test này vẫn đúng vì nó kiểm CÔNG THỨC, không kiểm config.
 */

import { describe, expect, it } from "vitest";

import {
  computeDrawDayCapacity,
  computeDrawsPerDay,
  isDrawSlotCreatable,
  listDrawSlotMinutes,
  MIN_SALES_WINDOW_SECONDS,
  minutesToHHmm,
} from "../../src/utils/draw-schedule";

/** Keno: 06:08 → 21:52, chu kỳ 8 phút, đóng bán trước 60s ⇒ 119 kỳ/ngày. */
const KENO = {
  firstDrawTime: "06:08",
  lastDrawTime: "21:52",
  intervalMinutes: 8,
  salesCloseBeforeSeconds: 60,
} as const;

/** Bingo 18: 06:06 → 21:53, chu kỳ 6 phút, đóng bán trước 30s ⇒ 158 kỳ/ngày. */
const BINGO18 = {
  firstDrawTime: "06:06",
  lastDrawTime: "21:53",
  intervalMinutes: 6,
  salesCloseBeforeSeconds: 30,
} as const;

/** Đổi `"HH:mm:ss"` thành giây-trong-ngày — cho test đọc bằng giờ thật thay vì số magic. */
function secondsOfDay(hhmmss: string): number {
  const [h, m, s] = hhmmss.split(":").map(Number);
  return h! * 3600 + m! * 60 + (s ?? 0);
}

/** Đổi `"HH:mm"` thành phút-trong-ngày — dùng để viết kỳ vọng dễ đọc. */
function minutesOfDay(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h! * 60 + m!;
}

describe("computeDrawsPerDay", () => {
  it("Đúng số học — floor((cuối − đầu) ÷ interval) + 1, kỳ đầu tính là 1 kỳ", () => {
    // Keno mặc định: 06:00 → 21:55, mỗi 5 phút.
    expect(computeDrawsPerDay("06:00", "21:55", 5)).toBe(192);
    // Kỳ đầu = kỳ cuối → đúng 1 kỳ.
    expect(computeDrawsPerDay("18:00", "18:00", 5)).toBe(1);
    // Khoảng lẻ không chia hết → floor, không làm tròn lên.
    expect(computeDrawsPerDay("06:00", "06:12", 5)).toBe(3);
  });

  it("Logic ngược — trả null khi input chưa hợp lệ", () => {
    expect(computeDrawsPerDay("6:00", "21:55", 5), "giờ đầu sai format").toBeNull();
    expect(computeDrawsPerDay("06:00", "24:00", 5), "giờ cuối sai format").toBeNull();
    expect(computeDrawsPerDay("06:00", "21:55", 0), "interval = 0").toBeNull();
    expect(computeDrawsPerDay("06:00", "21:55", -5), "interval âm").toBeNull();
    expect(computeDrawsPerDay("21:55", "06:00", 5), "kỳ cuối sớm hơn kỳ đầu").toBeNull();
  });
});

describe("minutesToHHmm", () => {
  it("Zero-pad cả giờ và phút", () => {
    expect(minutesToHHmm(0)).toBe("00:00");
    expect(minutesToHHmm(368)).toBe("06:08");
    expect(minutesToHHmm(1312)).toBe("21:52");
    expect(minutesToHHmm(1439)).toBe("23:59");
  });
});

describe("listDrawSlotMinutes", () => {
  it("Keno default → 119 slot, từ 06:08 tới 21:52", () => {
    const slots = listDrawSlotMinutes(KENO.firstDrawTime, KENO.lastDrawTime, KENO.intervalMinutes);

    expect(slots).not.toBeNull();
    expect(slots).toHaveLength(119);
    expect(slots![0]).toBe(minutesOfDay("06:08"));
    expect(slots!.at(-1)).toBe(minutesOfDay("21:52"));
  });

  it("Bingo 18 default → 158 slot, kỳ cuối là 21:48 (KHÔNG phải 21:53)", () => {
    const slots = listDrawSlotMinutes(BINGO18.firstDrawTime, BINGO18.lastDrawTime, BINGO18.intervalMinutes);

    expect(slots).toHaveLength(158);
    expect(slots![0]).toBe(minutesOfDay("06:06"));
    // Kỳ tiếp theo sau 21:48 là 21:54 > lastDrawTime 21:53 nên dừng ở 21:48.
    expect(slots!.at(-1)).toBe(minutesOfDay("21:48"));
  });

  it("Grid cách nhau đúng intervalMinutes và tăng dần", () => {
    const slots = listDrawSlotMinutes(KENO.firstDrawTime, KENO.lastDrawTime, KENO.intervalMinutes)!;

    for (let i = 1; i < slots.length; i++) {
      expect(slots[i]! - slots[i - 1]!).toBe(KENO.intervalMinutes);
    }
  });

  it("Kỳ đầu = kỳ cuối → đúng 1 slot", () => {
    expect(listDrawSlotMinutes("18:00", "18:00", 5)).toEqual([minutesOfDay("18:00")]);
  });

  it("Logic ngược — trả null khi config không hợp lệ (cùng contract computeDrawsPerDay)", () => {
    expect(listDrawSlotMinutes("6:08", "21:52", 8), "giờ đầu sai format").toBeNull();
    expect(listDrawSlotMinutes("06:08", "24:00", 8), "giờ cuối sai format").toBeNull();
    expect(listDrawSlotMinutes("06:08", "21:52", 0), "interval = 0").toBeNull();
    expect(listDrawSlotMinutes("06:08", "21:52", -8), "interval âm").toBeNull();
    expect(listDrawSlotMinutes("21:52", "06:08", 8), "kỳ cuối sớm hơn kỳ đầu").toBeNull();
  });

  it("BẤT BIẾN — length luôn khớp computeDrawsPerDay (2 hàm, 1 công thức)", () => {
    const cases: Array<[string, string, number]> = [
      [KENO.firstDrawTime, KENO.lastDrawTime, KENO.intervalMinutes],
      [BINGO18.firstDrawTime, BINGO18.lastDrawTime, BINGO18.intervalMinutes],
      ["06:00", "21:55", 5],
      ["00:00", "23:59", 1],
      ["09:15", "09:47", 7],
    ];

    for (const [first, last, interval] of cases) {
      const label = `${first}→${last}/${interval}p`;
      expect(listDrawSlotMinutes(first, last, interval)!.length, label).toBe(computeDrawsPerDay(first, last, interval));
    }
  });
});

describe("isDrawSlotCreatable", () => {
  it("Ngày tương lai (nowSecondsOfDay undefined) → mọi slot đều tạo được", () => {
    expect(isDrawSlotCreatable(minutesOfDay("06:08"), KENO.salesCloseBeforeSeconds)).toBe(true);
    expect(isDrawSlotCreatable(minutesOfDay("21:52"), KENO.salesCloseBeforeSeconds)).toBe(true);
  });

  it("Keno — slot 20:08 (closeAt 20:07): còn đúng 60s vẫn tạo được, 59s thì không", () => {
    const slot = minutesOfDay("20:08");

    // closeAt = 20:07:00. now = 20:06:00 ⇒ còn 60s = đúng ngưỡng ⇒ CHO PHÉP (dùng >=).
    expect(isDrawSlotCreatable(slot, KENO.salesCloseBeforeSeconds, secondsOfDay("20:06:00"))).toBe(true);
    // now = 20:06:01 ⇒ còn 59s ⇒ TỪ CHỐI.
    expect(isDrawSlotCreatable(slot, KENO.salesCloseBeforeSeconds, secondsOfDay("20:06:01"))).toBe(false);
    // now = 20:07:00 ⇒ đúng giờ đóng bán, còn 0s ⇒ TỪ CHỐI.
    expect(isDrawSlotCreatable(slot, KENO.salesCloseBeforeSeconds, secondsOfDay("20:07:00"))).toBe(false);
    // now = 20:09:00 ⇒ đã qua cả giờ quay ⇒ TỪ CHỐI.
    expect(isDrawSlotCreatable(slot, KENO.salesCloseBeforeSeconds, secondsOfDay("20:09:00"))).toBe(false);
  });

  it("Bingo 18 — closeBefore 30s ⇒ mốc cắt lệch đi 30s so với Keno", () => {
    const slot = minutesOfDay("20:06");

    // closeAt = 20:05:30. now = 20:04:30 ⇒ còn đúng 60s ⇒ CHO PHÉP.
    expect(isDrawSlotCreatable(slot, BINGO18.salesCloseBeforeSeconds, secondsOfDay("20:04:30"))).toBe(true);
    expect(isDrawSlotCreatable(slot, BINGO18.salesCloseBeforeSeconds, secondsOfDay("20:04:31"))).toBe(false);
  });

  it("Ngưỡng đúng bằng MIN_SALES_WINDOW_SECONDS, không phải 0", () => {
    const slot = minutesOfDay("12:00");
    const closeAtSeconds = slot * 60 - KENO.salesCloseBeforeSeconds;

    // Còn đúng ngưỡng ⇒ true; ít hơn 1 giây ⇒ false. Nếu ai đó hạ ngưỡng về 0, case thứ 2
    // sẽ đỏ ⇒ buộc đọc lại lý do ngưỡng tồn tại (xem JSDoc MIN_SALES_WINDOW_SECONDS).
    expect(isDrawSlotCreatable(slot, KENO.salesCloseBeforeSeconds, closeAtSeconds - MIN_SALES_WINDOW_SECONDS)).toBe(
      true,
    );
    expect(isDrawSlotCreatable(slot, KENO.salesCloseBeforeSeconds, closeAtSeconds - MIN_SALES_WINDOW_SECONDS + 1)).toBe(
      false,
    );
  });

  it("Đầu ngày với now = 00:00:00 → còn nguyên cửa sổ bán", () => {
    expect(isDrawSlotCreatable(minutesOfDay("06:08"), KENO.salesCloseBeforeSeconds, 0)).toBe(true);
  });
});

describe("computeDrawDayCapacity", () => {
  it("Ngày tương lai, chưa có kỳ nào → còn nguyên maxPerDay", () => {
    const cap = computeDrawDayCapacity({ ...KENO, occupiedMinutes: [] })!;

    expect(cap.maxPerDay).toBe(119);
    expect(cap.availableMinutes).toHaveLength(119);
    expect(cap.availableMinutes[0]).toBe(minutesOfDay("06:08"));
  });

  it("Hôm nay lúc 12:00 → loại 45 slot đầu ngày, slot đầu còn lại là 12:08", () => {
    const cap = computeDrawDayCapacity({
      ...KENO,
      occupiedMinutes: [],
      nowSecondsOfDay: secondsOfDay("12:00:00"),
    })!;

    // Slot 12:00 có closeAt 11:59 (đã qua) nên bị loại; slot 12:08 còn 6 phút 50s.
    expect(cap.availableMinutes).toHaveLength(74);
    expect(cap.availableMinutes[0]).toBe(minutesOfDay("12:08"));
  });

  it("Trừ slot đã có kỳ chiếm — theo TẬP HỢP, không theo số lượng", () => {
    const taken = [minutesOfDay("06:08"), minutesOfDay("10:00"), minutesOfDay("21:52")];
    const cap = computeDrawDayCapacity({ ...KENO, occupiedMinutes: taken })!;

    expect(cap.availableMinutes).toHaveLength(119 - 3);
    for (const m of taken) {
      expect(cap.availableMinutes, `slot ${minutesToHHmm(m)} phải bị loại`).not.toContain(m);
    }
  });

  it("Kỳ lệch lưới giờ KHÔNG làm giảm số kỳ còn tạo được", () => {
    // 20:03 không thuộc lưới 8 phút của Keno (lưới có 20:00 và 20:08) nên không chiếm slot
    // nào — trừ nó đi (cách làm theo số lượng) sẽ mất oan 1 kỳ.
    const cap = computeDrawDayCapacity({ ...KENO, occupiedMinutes: [minutesOfDay("20:03")] })!;

    expect(cap.availableMinutes).toHaveLength(119);
  });

  it("Không đếm đôi — slot vừa hết cửa sổ bán vừa đã có kỳ chỉ bị loại 1 lần", () => {
    const cap = computeDrawDayCapacity({
      ...KENO,
      // 07:00 đã qua giờ lúc 12:00, đồng thời đã có kỳ.
      occupiedMinutes: [minutesOfDay("07:00")],
      nowSecondsOfDay: secondsOfDay("12:00:00"),
    })!;

    // Giống hệt case không có kỳ nào: 45 slot đầu ngày bị loại vì hết giờ.
    expect(cap.availableMinutes).toHaveLength(74);
  });

  it("BẤT BIẾN — availableMinutes luôn là tập con của grid, không bao giờ vượt maxPerDay", () => {
    const grid = listDrawSlotMinutes(KENO.firstDrawTime, KENO.lastDrawTime, KENO.intervalMinutes)!;
    const gridSet = new Set(grid);

    const cases: Array<{ label: string; occupiedMinutes: number[]; nowSecondsOfDay?: number }> = [
      { label: "ngày tương lai, trống", occupiedMinutes: [] },
      { label: "ngày tương lai, có kỳ", occupiedMinutes: [minutesOfDay("08:00"), minutesOfDay("08:08")] },
      { label: "hôm nay 12:00, trống", occupiedMinutes: [], nowSecondsOfDay: secondsOfDay("12:00:00") },
      {
        label: "hôm nay 20:00, có kỳ cả sáng lẫn tối",
        occupiedMinutes: [minutesOfDay("07:00"), minutesOfDay("20:08"), minutesOfDay("21:52")],
        nowSecondsOfDay: secondsOfDay("20:00:00"),
      },
      { label: "hôm nay 23:00 (hết giờ)", occupiedMinutes: [], nowSecondsOfDay: secondsOfDay("23:00:00") },
      { label: "kỳ lệch lưới", occupiedMinutes: [minutesOfDay("20:03")] },
    ];

    for (const { label, occupiedMinutes, nowSecondsOfDay } of cases) {
      const cap = computeDrawDayCapacity({ ...KENO, occupiedMinutes, nowSecondsOfDay })!;

      expect(cap.availableMinutes.length, label).toBeLessThanOrEqual(cap.maxPerDay);
      // Không âm, không trùng, và mọi phần tử đều là mốc giờ thật của lưới.
      expect(new Set(cap.availableMinutes).size, label).toBe(cap.availableMinutes.length);
      for (const m of cap.availableMinutes) {
        expect(gridSet.has(m), `${label}: ${minutesToHHmm(m)} phải thuộc lưới`).toBe(true);
      }
      // Sort tăng dần — use-case map thẳng ra danh sách gợi ý theo thứ tự này.
      expect(cap.availableMinutes, label).toEqual([...cap.availableMinutes].toSorted((a, b) => a - b));
    }
  });

  it("Ngày đã tạo đủ kỳ → availableMinutes rỗng", () => {
    const wholeGrid = listDrawSlotMinutes(KENO.firstDrawTime, KENO.lastDrawTime, KENO.intervalMinutes)!;
    const cap = computeDrawDayCapacity({ ...KENO, occupiedMinutes: wholeGrid })!;

    expect(cap.availableMinutes).toEqual([]);
    expect(cap.maxPerDay).toBe(119);
  });

  it("Mốc cắt KHÔNG phải 'bỏ block hiện tại' — lúc 20:06 slot đầu là 20:08", () => {
    const at2006 = computeDrawDayCapacity({
      ...KENO,
      occupiedMinutes: [],
      nowSecondsOfDay: secondsOfDay("20:06:00"),
    })!;
    // Cách nghĩ sai (bỏ cả block 20:00→20:08) sẽ cho 20:16 và làm mất 1 kỳ.
    expect(at2006.availableMinutes[0]).toBe(minutesOfDay("20:08"));

    const at200601 = computeDrawDayCapacity({
      ...KENO,
      occupiedMinutes: [],
      nowSecondsOfDay: secondsOfDay("20:06:01"),
    })!;
    expect(at200601.availableMinutes[0]).toBe(minutesOfDay("20:16"));
  });

  it("Kỳ buổi sáng KHÔNG bị trừ hai lần (không ra số âm)", () => {
    // Buổi tối 20:00: 105 slot đầu ngày đã qua giờ, và tất cả đều đã có kỳ.
    const grid = listDrawSlotMinutes(KENO.firstDrawTime, KENO.lastDrawTime, KENO.intervalMinutes)!;
    const morning = grid.filter((m) => m < minutesOfDay("20:08"));

    const cap = computeDrawDayCapacity({
      ...KENO,
      occupiedMinutes: morning,
      nowSecondsOfDay: secondsOfDay("20:00:00"),
    })!;

    expect(morning).toHaveLength(105);
    // 14 slot từ 20:08 đến 21:52 — dương, không phải 14 − 105.
    expect(cap.availableMinutes).toHaveLength(14);
    expect(cap.availableMinutes[0]).toBe(minutesOfDay("20:08"));
  });

  it("Sau lastDrawTime → hết kỳ (UI dùng để gợi ý ngày mai)", () => {
    const cap = computeDrawDayCapacity({
      ...KENO,
      occupiedMinutes: [],
      nowSecondsOfDay: secondsOfDay("22:30:00"),
    })!;

    expect(cap.availableMinutes).toEqual([]);
  });

  it("occupiedMinutes trùng lặp → dedupe, chỉ loại 1 slot", () => {
    const cap = computeDrawDayCapacity({
      ...KENO,
      occupiedMinutes: [minutesOfDay("10:00"), minutesOfDay("10:00"), minutesOfDay("10:00")],
    })!;

    expect(cap.availableMinutes).toHaveLength(118);
  });

  it("Bingo 18 default → 158 kỳ/ngày", () => {
    const cap = computeDrawDayCapacity({ ...BINGO18, occupiedMinutes: [] })!;

    expect(cap.maxPerDay).toBe(158);
    expect(cap.availableMinutes).toHaveLength(158);
  });

  it("Logic ngược — config lịch quay không hợp lệ trả null", () => {
    expect(computeDrawDayCapacity({ ...KENO, lastDrawTime: "05:00", occupiedMinutes: [] })).toBeNull();
    expect(computeDrawDayCapacity({ ...KENO, intervalMinutes: 0, occupiedMinutes: [] })).toBeNull();
    expect(computeDrawDayCapacity({ ...KENO, firstDrawTime: "6:08", occupiedMinutes: [] })).toBeNull();
  });
});
