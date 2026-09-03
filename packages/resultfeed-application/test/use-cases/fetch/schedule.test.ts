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

import { computeNextFetchAt, computeNextFetchAtAfterConfirm } from "../../../src/use-cases/fetch/schedule";

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
