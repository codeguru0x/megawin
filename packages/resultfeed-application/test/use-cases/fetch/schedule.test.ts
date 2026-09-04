/**
 * ResultFeed – Unit test: Fetch Schedule
 *
 * PURE — không DB. `computeNextFetchAt`/`computeNextFetchAtAfterConfirm` là hàm pure (không
 * I/O, chỉ nhận `Date` làm input) — test bằng cách truyền `now`/`confirmedDrawDate` cố định,
 * không phụ thuộc `Date.now()` thật.
 *
 * Regression test chính: bug "nhảy lịch tính từ `now` bỏ sót kỳ ĐÃ công bố" (xem JSDoc đầu
 * `schedule.ts` mục "BUG ĐÃ SỬA (2026-09, vòng 2)") — case thật đã quan sát ở Max3D Pro
 * (lịch Thứ 3/Thứ 5/Thứ 7, 18:00 giờ VN): kỳ vừa xác nhận quay Thứ Bảy, nhưng tick xác nhận
 * chạy trễ tới tận Thứ Tư tuần sau (do lặp `result_unavailable` nhiều ngày — không phải sự cố
 * cần backoff). Tính `nextFetchAt` từ `now` (Thứ Tư) sẽ nhảy qua đúng slot Thứ Ba đã trôi qua
 * — trong khi kỳ đó đã có kết quả từ lâu.
 */

import { describe, expect, it } from "vitest";

import {
  computeNextFetchAt,
  computeNextFetchAtAfterConfirm,
  computeNextFetchAtOnUnavailable,
} from "../../../src/use-cases/fetch/schedule";

/** Lịch Max3D Pro thật (`apps/worker-resultfeed/src/handlers/fetch/vietlott-max3dpro.ts`). */
const MAX3DPRO_SCHEDULE = {
  type: "fixed" as const,
  drawTimesVn: ["18:00"],
  drawDaysOfWeek: [2, 4, 6], // Thứ 3, Thứ 5, Thứ 7
};

const ONE_MINUTE_MS = 60 * 1000;

describe("computeNextFetchAt", () => {
  it("continuous: trả now + minIntervalMs (±20% jitter)", () => {
    const now = new Date("2026-09-02T12:00:00+07:00");
    const result = computeNextFetchAt({ type: "continuous" }, now, 5 * ONE_MINUTE_MS);
    const diffMs = result.getTime() - now.getTime();
    expect(diffMs).toBeGreaterThanOrEqual(4 * ONE_MINUTE_MS);
    expect(diffMs).toBeLessThanOrEqual(6 * ONE_MINUTE_MS);
  });

  it("fixed: đúng nhịp (now = ngay sau giờ quay) → nhảy tới slot kế tiếp trong lịch", () => {
    // Thứ Bảy 29/08/2026, 18:03 — vừa xác nhận kỳ quay 18:00 cùng ngày.
    const now = new Date("2026-08-29T18:03:00+07:00");
    const result = computeNextFetchAt(MAX3DPRO_SCHEDULE, now, ONE_MINUTE_MS);
    // Slot kế tiếp trong lịch (Thứ 3/5/7) sau Thứ Bảy là Thứ Ba 01/09/2026.
    expect(result.getTime()).toBeGreaterThan(new Date("2026-09-01T17:56:00+07:00").getTime());
    expect(result.getTime()).toBeLessThan(new Date("2026-09-01T18:04:00+07:00").getTime());
  });
});

describe("computeNextFetchAtAfterConfirm", () => {
  it("continuous: giống computeNextFetchAt — now + minIntervalMs", () => {
    const now = new Date("2026-09-02T12:00:00+07:00");
    const result = computeNextFetchAtAfterConfirm({ type: "continuous" }, "2026-09-02", now, 5 * ONE_MINUTE_MS);
    const diffMs = result.getTime() - now.getTime();
    expect(diffMs).toBeGreaterThanOrEqual(4 * ONE_MINUTE_MS);
    expect(diffMs).toBeLessThanOrEqual(6 * ONE_MINUTE_MS);
  });

  it("fixed: đúng nhịp (now ≈ ngày quay của kỳ vừa xác nhận) → giống computeNextFetchAt", () => {
    // Vừa xác nhận kỳ quay Thứ Bảy 29/08/2026, tick chạy ngay sau đó (18:03 cùng ngày).
    const confirmedDrawDate = "2026-08-29";
    const now = new Date("2026-08-29T18:03:00+07:00");
    const result = computeNextFetchAtAfterConfirm(MAX3DPRO_SCHEDULE, confirmedDrawDate, now, ONE_MINUTE_MS);
    // Slot kế tiếp là Thứ Ba 01/09/2026 18:00 — CHƯA bị bug, vẫn ở tương lai so với `now`.
    expect(result.getTime()).toBeGreaterThan(new Date("2026-09-01T17:56:00+07:00").getTime());
    expect(result.getTime()).toBeLessThan(new Date("2026-09-01T18:04:00+07:00").getTime());
  });

  it("fixed nhiều slot/ngày (Lotto535 13:00+21:00): vừa xác nhận slot 13:00 → trả đúng slot 21:00 CÙNG ngày, không nhảy qua ngày sau", () => {
    const LOTTO535_SCHEDULE = { type: "fixed" as const, drawTimesVn: ["13:00", "21:00"] };
    const confirmedDrawDate = "2026-09-02";
    const now = new Date("2026-09-02T13:03:00+07:00");
    const result = computeNextFetchAtAfterConfirm(LOTTO535_SCHEDULE, confirmedDrawDate, now, ONE_MINUTE_MS);
    // Phải là 21:00 CÙNG ngày (2026-09-02), KHÔNG bị đẩy sang 13:00 ngày 2026-09-03.
    expect(result.getTime()).toBeGreaterThan(new Date("2026-09-02T20:56:00+07:00").getTime());
    expect(result.getTime()).toBeLessThan(new Date("2026-09-02T21:04:00+07:00").getTime());
  });

  it("REGRESSION: tick xác nhận TRỄ (đã qua cả slot kế tiếp) → retry SỚM, KHÔNG nhảy tới slot xa hơn", () => {
    // Kỳ vừa xác nhận quay Thứ Bảy 29/08/2026 (00772), nhưng tick chỉ chạy được tới Thứ Tư
    // 02/09/2026 21:35 (case thật đã quan sát — chờ result_unavailable kéo dài nhiều ngày).
    // Slot Thứ Ba 01/09/2026 18:00 (kỳ 00773) đã trôi qua — kỳ đó rất có thể ĐÃ công bố.
    const confirmedDrawDate = "2026-08-29";
    const now = new Date("2026-09-02T21:35:30+07:00");
    const minIntervalMs = 5 * ONE_MINUTE_MS;

    const buggyResult = computeNextFetchAt(MAX3DPRO_SCHEDULE, now, minIntervalMs);
    // Hành vi CŨ (bug): tính từ `now` → bỏ qua slot Thứ Ba đã trôi qua, nhảy tới Thứ Năm
    // 03/09/2026 — xác nhận lại đúng bug đã mô tả (để đối chiếu, KHÔNG phải assertion cho fix).
    expect(buggyResult.getTime()).toBeGreaterThan(new Date("2026-09-03T00:00:00+07:00").getTime());

    const fixedResult = computeNextFetchAtAfterConfirm(MAX3DPRO_SCHEDULE, confirmedDrawDate, now, minIntervalMs);
    // Hành vi ĐÚNG: retry gần `now` (trong khoảng minIntervalMs ± jitter), KHÔNG đợi tới
    // Thứ Năm — để tick kế tiếp có cơ hội fetch ngay kỳ 00773 đã bị bỏ sót.
    const diffMs = fixedResult.getTime() - now.getTime();
    expect(diffMs).toBeGreaterThanOrEqual(0);
    expect(diffMs).toBeLessThanOrEqual(1.2 * minIntervalMs);
  });

  it("fixed: lịch rỗng (drawTimesVn = []) → fallback now + minIntervalMs, không throw", () => {
    const now = new Date("2026-09-02T21:35:30+07:00");
    const minIntervalMs = 5 * ONE_MINUTE_MS;
    const result = computeNextFetchAtAfterConfirm({ type: "fixed", drawTimesVn: [] }, "2026-08-29", now, minIntervalMs);
    const diffMs = result.getTime() - now.getTime();
    expect(diffMs).toBeGreaterThanOrEqual(0);
    expect(diffMs).toBeLessThanOrEqual(1.2 * minIntervalMs);
  });
});

describe("computeNextFetchAtOnUnavailable", () => {
  /** Lịch Bingo18 thật (`apps/worker-resultfeed/src/handlers/fetch/vietlott-bingo18.ts`). */
  const BINGO18_SCHEDULE = {
    type: "continuous-daily-window" as const,
    firstDrawVn: "06:06",
    lastDrawVn: "21:53",
    drawIntervalMs: 6 * ONE_MINUTE_MS,
  };
  const MIN_INTERVAL_MS = 2 * ONE_MINUTE_MS;

  it("continuous (thuần): giống computeNextFetchAt — now + minIntervalMs", () => {
    const now = new Date("2026-09-02T12:00:00+07:00");
    const result = computeNextFetchAtOnUnavailable({ type: "continuous" }, now, 5 * ONE_MINUTE_MS);
    const diffMs = result.getTime() - now.getTime();
    expect(diffMs).toBeGreaterThanOrEqual(4 * ONE_MINUTE_MS);
    expect(diffMs).toBeLessThanOrEqual(6 * ONE_MINUTE_MS);
  });

  it("Giai đoạn 1 — giữa ngày (trong vùng hoạt động): nhịp minIntervalMs như cũ", () => {
    const now = new Date("2026-09-02T12:00:00+07:00");
    const result = computeNextFetchAtOnUnavailable(BINGO18_SCHEDULE, now, MIN_INTERVAL_MS);
    const diffMs = result.getTime() - now.getTime();
    expect(diffMs).toBeGreaterThanOrEqual(0.8 * MIN_INTERVAL_MS);
    expect(diffMs).toBeLessThanOrEqual(1.2 * MIN_INTERVAL_MS);
  });

  it("Giai đoạn 1 — biên nới rộng: 21:55 (SAU lastDrawVn 21:53 nhưng TRƯỚC 21:59 = lastDrawVn + drawIntervalMs) vẫn nhịp minIntervalMs, KHÔNG giãn", () => {
    const now = new Date("2026-09-02T21:55:00+07:00");
    const result = computeNextFetchAtOnUnavailable(BINGO18_SCHEDULE, now, MIN_INTERVAL_MS);
    const diffMs = result.getTime() - now.getTime();
    expect(diffMs).toBeGreaterThanOrEqual(0.8 * MIN_INTERVAL_MS);
    expect(diffMs).toBeLessThanOrEqual(1.2 * MIN_INTERVAL_MS);
  });

  it("Giai đoạn 1 — biên nới rộng buổi sáng: 06:02 (TRƯỚC firstDrawVn 06:06 nhưng SAU 06:00 = firstDrawVn - drawIntervalMs) vẫn nhịp minIntervalMs", () => {
    const now = new Date("2026-09-02T06:02:00+07:00");
    const result = computeNextFetchAtOnUnavailable(BINGO18_SCHEDULE, now, MIN_INTERVAL_MS);
    const diffMs = result.getTime() - now.getTime();
    expect(diffMs).toBeGreaterThanOrEqual(0.8 * MIN_INTERVAL_MS);
    expect(diffMs).toBeLessThanOrEqual(1.2 * MIN_INTERVAL_MS);
  });

  it("Giai đoạn 2 — vừa qua vùng hoạt động (22:05, trong 30 phút đệm chờ sau 21:59): nhịp bufferIntervalMs (mặc định 3 phút)", () => {
    const now = new Date("2026-09-02T22:05:00+07:00");
    const result = computeNextFetchAtOnUnavailable(BINGO18_SCHEDULE, now, MIN_INTERVAL_MS);
    const diffMs = result.getTime() - now.getTime();
    expect(diffMs).toBeGreaterThanOrEqual(0.8 * 3 * ONE_MINUTE_MS);
    expect(diffMs).toBeLessThanOrEqual(1.2 * 3 * ONE_MINUTE_MS);
  });

  it("Giai đoạn 2 — vẫn còn đệm chờ ở đúng ranh giới 22:29 (= 21:59 + 30 phút, inclusive)", () => {
    const now = new Date("2026-09-02T22:29:00+07:00");
    const result = computeNextFetchAtOnUnavailable(BINGO18_SCHEDULE, now, MIN_INTERVAL_MS);
    const diffMs = result.getTime() - now.getTime();
    expect(diffMs).toBeGreaterThanOrEqual(0.8 * 3 * ONE_MINUTE_MS);
    expect(diffMs).toBeLessThanOrEqual(1.2 * 3 * ONE_MINUTE_MS);
  });

  it("Giai đoạn 3 — hết đệm chờ (22:35, sau 21:59 + 30 phút đệm = 22:29): nhịp nightIntervalMs (mặc định 30 phút)", () => {
    const now = new Date("2026-09-02T22:35:00+07:00");
    const result = computeNextFetchAtOnUnavailable(BINGO18_SCHEDULE, now, MIN_INTERVAL_MS);
    const diffMs = result.getTime() - now.getTime();
    expect(diffMs).toBeGreaterThanOrEqual(0.8 * 30 * ONE_MINUTE_MS);
    expect(diffMs).toBeLessThanOrEqual(1.2 * 30 * ONE_MINUTE_MS);
  });

  it("Giai đoạn 4 — CUTOFF: 05:50 (nightIntervalMs 30 phút sẽ vượt 06:00 = firstDrawVn - drawIntervalMs ngày ĐÓ) → chặn trần đúng 06:00, không jitter, không vượt", () => {
    const now = new Date("2026-09-02T05:50:00+07:00");
    const result = computeNextFetchAtOnUnavailable(BINGO18_SCHEDULE, now, MIN_INTERVAL_MS);
    expect(result.getTime()).toBe(new Date("2026-09-02T06:00:00+07:00").getTime());
  });

  it("Giai đoạn 4 — CUTOFF ngay sát: 05:59 → chặn trần đúng 06:00 NGAY (không đợi thêm 1 nightIntervalMs)", () => {
    const now = new Date("2026-09-02T05:59:00+07:00");
    const result = computeNextFetchAtOnUnavailable(BINGO18_SCHEDULE, now, MIN_INTERVAL_MS);
    expect(result.getTime()).toBe(new Date("2026-09-02T06:00:00+07:00").getTime());
  });

  it("REGRESSION — kỳ cuối trễ: 21:57 (SAU lastDrawVn 21:53, còn TRONG biên nới 21:59) vẫn nhịp minIntervalMs — đảm bảo lấy xong kỳ cuối mới giãn nhịp", () => {
    const now = new Date("2026-09-02T21:57:00+07:00");
    const result = computeNextFetchAtOnUnavailable(BINGO18_SCHEDULE, now, MIN_INTERVAL_MS);
    const diffMs = result.getTime() - now.getTime();
    expect(diffMs).toBeGreaterThanOrEqual(0.8 * MIN_INTERVAL_MS);
    expect(diffMs).toBeLessThanOrEqual(1.2 * MIN_INTERVAL_MS);
  });

  it("tuỳ chỉnh bufferIntervalMs/bufferDurationMs/nightIntervalMs qua config — 10 phút đệm/1 giờ/1 giờ nghỉ đêm", () => {
    const customSchedule = {
      ...BINGO18_SCHEDULE,
      bufferIntervalMs: 10 * ONE_MINUTE_MS,
      bufferDurationMs: 60 * ONE_MINUTE_MS,
      nightIntervalMs: 60 * ONE_MINUTE_MS,
    };
    // 22:30 — trong 60 phút đệm chờ sau 21:59 → nhịp 10 phút.
    const bufferResult = computeNextFetchAtOnUnavailable(
      customSchedule,
      new Date("2026-09-02T22:30:00+07:00"),
      MIN_INTERVAL_MS,
    );
    const bufferDiffMs = bufferResult.getTime() - new Date("2026-09-02T22:30:00+07:00").getTime();
    expect(bufferDiffMs).toBeGreaterThanOrEqual(0.8 * 10 * ONE_MINUTE_MS);
    expect(bufferDiffMs).toBeLessThanOrEqual(1.2 * 10 * ONE_MINUTE_MS);

    // 23:30 — hết 60 phút đệm (21:59 + 60 phút = 22:59) → nhịp nghỉ đêm 60 phút.
    const nightResult = computeNextFetchAtOnUnavailable(
      customSchedule,
      new Date("2026-09-02T23:30:00+07:00"),
      MIN_INTERVAL_MS,
    );
    const nightDiffMs = nightResult.getTime() - new Date("2026-09-02T23:30:00+07:00").getTime();
    expect(nightDiffMs).toBeGreaterThanOrEqual(0.8 * 60 * ONE_MINUTE_MS);
    expect(nightDiffMs).toBeLessThanOrEqual(1.2 * 60 * ONE_MINUTE_MS);
  });
});
