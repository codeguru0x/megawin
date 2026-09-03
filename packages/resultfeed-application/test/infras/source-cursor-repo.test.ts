/**
 * ResultFeed – Integration test: SourceCursorRepository
 *
 * Trọng tâm: `ensureCursor` idempotent KHÔNG reset tiến độ đã ghi bởi `recordSuccess`, backoff
 * counter (`consecutiveFailures`) tăng đúng qua `recordFailure`, và **bất biến lịch chạy**: mọi
 * đường thất bại đều đẩy `nextFetchAt` về tương lai (chống hot-loop đốt request).
 */

import type { ResultFeedSourceId } from "@megawin/resultfeed/entities";
import { ResultFeedGameKey } from "@megawin/resultfeed/entities";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { SourceCursorRepository } from "../../src/infras/repos/source-cursor-repo";

const TEST_GAME_KEY = ResultFeedGameKey.Keno;
// Sentinel test source id — cast vì `ResultFeedSourceId` là literal union hardcode (chỉ chứa
// nguồn thật, xem `enums.ts`), không có nghĩa nguồn test này phải nằm trong danh sách đó.
const TEST_SOURCE_ID = "test-source-cursor-repo-src" as ResultFeedSourceId;

const repo = new SourceCursorRepository();

async function cleanup(): Promise<void> {
  await repo.deleteMany({ sourceId: TEST_SOURCE_ID, gameKey: TEST_GAME_KEY });
}

beforeEach(cleanup);
afterAll(cleanup);

describe("SourceCursorRepository.ensureCursor — idempotent, không reset tiến độ đã có", () => {
  it("lần đầu → tạo cursor mới, chưa biết kỳ nào (null)", async () => {
    await repo.ensureCursor(TEST_SOURCE_ID, TEST_GAME_KEY);

    const cursor = await repo.findBySourceAndGameKey(TEST_SOURCE_ID, TEST_GAME_KEY);
    expect(cursor).not.toBeNull();
    expect(cursor!.lastConfirmedPeriod).toBeNull();
    expect(cursor!.nextExpectedPeriod).toBeNull();
    expect(cursor!.consecutiveFailures).toBe(0);
    expect(cursor!.needsBackfill).toBe(false);
    expect(cursor!.consecutiveIntrinsicFailures).toBe(0);
    expect(cursor!.isPaused).toBe(false);
  });

  it("gọi lại SAU KHI recordSuccess → KHÔNG reset lastConfirmedPeriod về null", async () => {
    await repo.ensureCursor(TEST_SOURCE_ID, TEST_GAME_KEY);
    const created = await repo.findBySourceAndGameKey(TEST_SOURCE_ID, TEST_GAME_KEY);

    const nextFetchAt = new Date(Date.now() + 60_000);
    await repo.recordSuccess(created!.id, {
      lastConfirmedPeriod: "0001000",
      nextExpectedPeriod: "0001001",
      nextFetchAt,
    });

    // ensureCursor gọi lại — filter khớp doc đã tồn tại ⇒ $setOnInsert không chạy.
    await repo.ensureCursor(TEST_SOURCE_ID, TEST_GAME_KEY);

    const after = await repo.findBySourceAndGameKey(TEST_SOURCE_ID, TEST_GAME_KEY);
    expect(after!.lastConfirmedPeriod).toBe("0001000"); // KHÔNG bị reset về null.
    expect(after!.nextExpectedPeriod).toBe("0001001");
  });
});

describe("SourceCursorRepository.recordSuccess — reset failure counter", () => {
  it("sau khi có failure, recordSuccess phải reset consecutiveFailures về 0", async () => {
    await repo.ensureCursor(TEST_SOURCE_ID, TEST_GAME_KEY);
    const cursor = await repo.findBySourceAndGameKey(TEST_SOURCE_ID, TEST_GAME_KEY);

    await repo.recordFailure(cursor!.id, {
      nextFetchAt: new Date(Date.now() + 10_000),
    });
    await repo.recordFailure(cursor!.id, {
      nextFetchAt: new Date(Date.now() + 20_000),
    });

    const beforeSuccess = await repo.findBySourceAndGameKey(TEST_SOURCE_ID, TEST_GAME_KEY);
    expect(beforeSuccess!.consecutiveFailures).toBe(2);

    await repo.recordSuccess(cursor!.id, {
      lastConfirmedPeriod: "0002000",
      nextExpectedPeriod: "0002001",
      nextFetchAt: new Date(Date.now() + 60_000),
    });

    const after = await repo.findBySourceAndGameKey(TEST_SOURCE_ID, TEST_GAME_KEY);
    expect(after!.consecutiveFailures).toBe(0);
  });

  it("KHÔNG đụng needsBackfill — 1 tick thành công giữa chuỗi backlog không có nghĩa đã hết backlog", async () => {
    // needsBackfill chỉ tắt ở recordUnavailable (xác nhận đã chạm mép dữ liệu thật) hoặc
    // ops seedAnchor/markNeedsBackfill — KHÔNG tắt chỉ vì 1 tick "ok".
    await repo.ensureCursor(TEST_SOURCE_ID, TEST_GAME_KEY);
    const cursor = await repo.findBySourceAndGameKey(TEST_SOURCE_ID, TEST_GAME_KEY);
    await repo.recordFailure(cursor!.id, { nextFetchAt: new Date(Date.now() + 10_000) });

    const beforeSuccess = await repo.findBySourceAndGameKey(TEST_SOURCE_ID, TEST_GAME_KEY);
    expect(beforeSuccess!.needsBackfill).toBe(true);

    await repo.recordSuccess(cursor!.id, {
      lastConfirmedPeriod: "0002500",
      nextExpectedPeriod: "0002501",
      nextFetchAt: new Date(Date.now() + 60_000),
    });

    const after = await repo.findBySourceAndGameKey(TEST_SOURCE_ID, TEST_GAME_KEY);
    expect(after!.needsBackfill).toBe(true);
  });
});

describe("SourceCursorRepository.recordFailure — bất biến lịch chạy: LUÔN đẩy nextFetchAt", () => {
  it("mọi loại thất bại đều tăng consecutiveFailures VÀ đẩy nextFetchAt về tương lai", async () => {
    // Bất biến chống hot-loop: nhánh thất bại nào không đẩy `nextFetchAt` sẽ khiến cron 1 phút
    // gọi lại đúng URL đó mãi mãi (~1.440 request/ngày trả phí cho câu trả lời không đổi).
    await repo.ensureCursor(TEST_SOURCE_ID, TEST_GAME_KEY);
    const cursor = await repo.findBySourceAndGameKey(TEST_SOURCE_ID, TEST_GAME_KEY);

    const backoffAt = new Date(Date.now() + 300_000);
    await repo.recordFailure(cursor!.id, { nextFetchAt: backoffAt });

    const after = await repo.findBySourceAndGameKey(TEST_SOURCE_ID, TEST_GAME_KEY);
    expect(after!.consecutiveFailures).toBe(1);
    expect(after!.nextFetchAt.getTime()).toBe(backoffAt.getTime());
  });

  it("LUÔN set needsBackfill = true — chính pipeline xác nhận có sự cố, không suy luận theo thời gian", async () => {
    // Đây là tín hiệu duy nhất cho `FetchAndParseUseCase.beforeLoop` bật `burstEnabled`.
    await repo.ensureCursor(TEST_SOURCE_ID, TEST_GAME_KEY);
    const cursor = await repo.findBySourceAndGameKey(TEST_SOURCE_ID, TEST_GAME_KEY);
    expect(cursor!.needsBackfill).toBe(false);

    await repo.recordFailure(cursor!.id, { nextFetchAt: new Date(Date.now() + 10_000) });

    const after = await repo.findBySourceAndGameKey(TEST_SOURCE_ID, TEST_GAME_KEY);
    expect(after!.needsBackfill).toBe(true);
  });
});

describe("SourceCursorRepository.recordUnavailable — probe-miss BÌNH THƯỜNG, không phải backoff", () => {
  it("reset consecutiveFailures về 0 và đặt nextFetchAt bình thường — KHÔNG đổi lastConfirmedPeriod", async () => {
    // Khác `recordFailure`: đây KHÔNG phải sự cố (kỳ chưa có kết quả — live edge hoặc
    // đang backfill sát hiện tại) nên KHÔNG được cộng dồn vào backoff luỹ tiến, và tuyệt
    // đối không đụng `lastConfirmedPeriod` (kỳ trước vẫn là kỳ đã xác nhận gần nhất).
    await repo.ensureCursor(TEST_SOURCE_ID, TEST_GAME_KEY);
    const cursor = await repo.findBySourceAndGameKey(TEST_SOURCE_ID, TEST_GAME_KEY);

    await repo.recordSuccess(cursor!.id, {
      lastConfirmedPeriod: "0294100",
      nextExpectedPeriod: "0294101",
      nextFetchAt: new Date(),
    });
    // Giả lập từng có vài lần lỗi thật trước đó — recordUnavailable phải reset về 0.
    await repo.recordFailure(cursor!.id, { nextFetchAt: new Date(Date.now() + 10_000) });
    await repo.recordFailure(cursor!.id, { nextFetchAt: new Date(Date.now() + 20_000) });

    const nextFetchAt = new Date(Date.now() + 60_000);
    const applied = await repo.recordUnavailable(cursor!.id, nextFetchAt);
    expect(applied).toBe(true);

    const after = await repo.findBySourceAndGameKey(TEST_SOURCE_ID, TEST_GAME_KEY);
    expect(after!.consecutiveFailures).toBe(0);
    expect(after!.nextFetchAt.getTime()).toBe(nextFetchAt.getTime());
    // Kỳ đã xác nhận trước đó KHÔNG bị đụng — kỳ "chưa có kết quả" là kỳ SAU nó, chưa
    // confirm được thì không được ghi đè lên kỳ đã confirm.
    expect(after!.lastConfirmedPeriod).toBe("0294100");
  });

  it("tắt needsBackfill — XÁC NHẬN đã đuổi tới mép dữ liệu thật, không còn gì để backfill", async () => {
    await repo.ensureCursor(TEST_SOURCE_ID, TEST_GAME_KEY);
    const cursor = await repo.findBySourceAndGameKey(TEST_SOURCE_ID, TEST_GAME_KEY);
    await repo.recordFailure(cursor!.id, { nextFetchAt: new Date(Date.now() + 10_000) });

    const beforeUnavailable = await repo.findBySourceAndGameKey(TEST_SOURCE_ID, TEST_GAME_KEY);
    expect(beforeUnavailable!.needsBackfill).toBe(true);

    await repo.recordUnavailable(cursor!.id, new Date(Date.now() + 60_000));

    const after = await repo.findBySourceAndGameKey(TEST_SOURCE_ID, TEST_GAME_KEY);
    expect(after!.needsBackfill).toBe(false);
  });
});

describe("SourceCursorRepository.seedAnchor — đường nạp kỳ khởi điểm từ người vận hành", () => {
  it("neo kỳ khởi điểm cho cursor chưa từng có kỳ nào, reset failure counter", async () => {
    // Cần thiết khi cursor cold start — máy không có cách nào tự biết kỳ mới nhất (không có
    // parser trang list) ⇒ không có method này thì nguồn không bao giờ chạy (`awaiting_seed`).
    await repo.ensureCursor(TEST_SOURCE_ID, TEST_GAME_KEY);
    const cursor = await repo.findBySourceAndGameKey(TEST_SOURCE_ID, TEST_GAME_KEY);
    await repo.recordFailure(cursor!.id, { nextFetchAt: new Date(Date.now() + 600_000) });

    const applied = await repo.seedAnchor(TEST_SOURCE_ID, TEST_GAME_KEY, {
      lastConfirmedPeriod: "0294026",
      nextExpectedPeriod: "0294027",
    });
    expect(applied).toBe(true);

    const after = await repo.findBySourceAndGameKey(TEST_SOURCE_ID, TEST_GAME_KEY);
    expect(after!.lastConfirmedPeriod).toBe("0294026");
    expect(after!.nextExpectedPeriod).toBe("0294027");
    // Seed là khởi động sạch — không mang theo backoff của chuỗi lỗi trước.
    expect(after!.consecutiveFailures).toBe(0);
    expect(after!.needsBackfill).toBe(false);
    expect(after!.consecutiveIntrinsicFailures).toBe(0);
    expect(after!.isPaused).toBe(false);
    expect(after!.nextFetchAt.getTime()).toBeLessThanOrEqual(Date.now());
  });
});

describe("SourceCursorRepository.markNeedsBackfill — đường ops bật/tắt catch-up thủ công", () => {
  it("bật needsBackfill KHÔNG đụng consecutiveFailures/nextFetchAt/lastConfirmedPeriod", async () => {
    // Case thực tế: consensus phát hiện lệch dữ liệu ở nguồn này, ops muốn bật catch-up
    // cho lượt worker kế tiếp mà không phải đi qua nhánh lỗi tự động.
    await repo.ensureCursor(TEST_SOURCE_ID, TEST_GAME_KEY);
    const cursor = await repo.findBySourceAndGameKey(TEST_SOURCE_ID, TEST_GAME_KEY);
    const nextFetchAt = new Date(Date.now() + 45_000);
    await repo.recordSuccess(cursor!.id, {
      lastConfirmedPeriod: "0295000",
      nextExpectedPeriod: "0295001",
      nextFetchAt,
    });

    const applied = await repo.markNeedsBackfill(cursor!.id, true);
    expect(applied).toBe(true);

    const after = await repo.findBySourceAndGameKey(TEST_SOURCE_ID, TEST_GAME_KEY);
    expect(after!.needsBackfill).toBe(true);
    expect(after!.consecutiveFailures).toBe(0);
    expect(after!.nextFetchAt.getTime()).toBe(nextFetchAt.getTime());
    expect(after!.lastConfirmedPeriod).toBe("0295000");
  });

  it("tắt needsBackfill (ops huỷ catch-up thủ công)", async () => {
    await repo.ensureCursor(TEST_SOURCE_ID, TEST_GAME_KEY);
    const cursor = await repo.findBySourceAndGameKey(TEST_SOURCE_ID, TEST_GAME_KEY);
    await repo.recordFailure(cursor!.id, { nextFetchAt: new Date(Date.now() + 10_000) });

    await repo.markNeedsBackfill(cursor!.id, false);

    const after = await repo.findBySourceAndGameKey(TEST_SOURCE_ID, TEST_GAME_KEY);
    expect(after!.needsBackfill).toBe(false);
  });
});

describe("SourceCursorRepository.recordIntrinsicFailure / recordIntrinsicPassed — lưới chặn parser đọc sai (silent)", () => {
  it("tăng consecutiveIntrinsicFailures, pause=false KHÔNG đụng isPaused/needsBackfill", async () => {
    await repo.ensureCursor(TEST_SOURCE_ID, TEST_GAME_KEY);
    const cursor = await repo.findBySourceAndGameKey(TEST_SOURCE_ID, TEST_GAME_KEY);

    const applied = await repo.recordIntrinsicFailure(cursor!.id, {
      consecutiveIntrinsicFailures: 1,
      pause: false,
    });
    expect(applied).toBe(true);

    const after = await repo.findBySourceAndGameKey(TEST_SOURCE_ID, TEST_GAME_KEY);
    expect(after!.consecutiveIntrinsicFailures).toBe(1);
    expect(after!.isPaused).toBe(false);
    expect(after!.needsBackfill).toBe(false);
  });

  it("pause=true đồng thời set isPaused=true VÀ needsBackfill=true (chắc chắn có backlog khi resume)", async () => {
    await repo.ensureCursor(TEST_SOURCE_ID, TEST_GAME_KEY);
    const cursor = await repo.findBySourceAndGameKey(TEST_SOURCE_ID, TEST_GAME_KEY);

    await repo.recordIntrinsicFailure(cursor!.id, {
      consecutiveIntrinsicFailures: 3,
      pause: true,
    });

    const after = await repo.findBySourceAndGameKey(TEST_SOURCE_ID, TEST_GAME_KEY);
    expect(after!.consecutiveIntrinsicFailures).toBe(3);
    expect(after!.isPaused).toBe(true);
    expect(after!.needsBackfill).toBe(true);
  });

  it("recordIntrinsicPassed reset consecutiveIntrinsicFailures về 0, KHÔNG đụng isPaused", async () => {
    await repo.ensureCursor(TEST_SOURCE_ID, TEST_GAME_KEY);
    const cursor = await repo.findBySourceAndGameKey(TEST_SOURCE_ID, TEST_GAME_KEY);
    await repo.recordIntrinsicFailure(cursor!.id, { consecutiveIntrinsicFailures: 2, pause: false });

    await repo.recordIntrinsicPassed(cursor!.id);

    const after = await repo.findBySourceAndGameKey(TEST_SOURCE_ID, TEST_GAME_KEY);
    expect(after!.consecutiveIntrinsicFailures).toBe(0);
    expect(after!.isPaused).toBe(false);
  });
});

describe("SourceCursorRepository.schedulePausedRetry / resumeFromPause — chu trình TỰ ĐỘNG PAUSE", () => {
  it("schedulePausedRetry CHỈ ghi nextFetchAt, không đụng isPaused/consecutiveFailures/counter", async () => {
    await repo.ensureCursor(TEST_SOURCE_ID, TEST_GAME_KEY);
    const cursor = await repo.findBySourceAndGameKey(TEST_SOURCE_ID, TEST_GAME_KEY);
    await repo.recordIntrinsicFailure(cursor!.id, { consecutiveIntrinsicFailures: 3, pause: true });

    const retryAt = new Date(Date.now() + 900_000);
    await repo.schedulePausedRetry(cursor!.id, retryAt);

    const after = await repo.findBySourceAndGameKey(TEST_SOURCE_ID, TEST_GAME_KEY);
    expect(after!.nextFetchAt.getTime()).toBe(retryAt.getTime());
    expect(after!.isPaused).toBe(true);
    expect(after!.consecutiveIntrinsicFailures).toBe(3);
    expect(after!.consecutiveFailures).toBe(0);
  });

  it("resumeFromPause tắt isPaused + reset counter, GIỮ needsBackfill=true để burst đuổi backlog tích lại", async () => {
    await repo.ensureCursor(TEST_SOURCE_ID, TEST_GAME_KEY);
    const cursor = await repo.findBySourceAndGameKey(TEST_SOURCE_ID, TEST_GAME_KEY);
    await repo.recordIntrinsicFailure(cursor!.id, { consecutiveIntrinsicFailures: 3, pause: true });

    const applied = await repo.resumeFromPause(cursor!.id);
    expect(applied).toBe(true);

    const after = await repo.findBySourceAndGameKey(TEST_SOURCE_ID, TEST_GAME_KEY);
    expect(after!.isPaused).toBe(false);
    expect(after!.consecutiveIntrinsicFailures).toBe(0);
    expect(after!.needsBackfill).toBe(true);
    expect(after!.nextFetchAt.getTime()).toBeLessThanOrEqual(Date.now());
  });
});

describe("SourceCursorRepository.findDue", () => {
  it("chỉ trả cursor có nextFetchAt <= now", async () => {
    await repo.ensureCursor(TEST_SOURCE_ID, TEST_GAME_KEY);
    const cursor = await repo.findBySourceAndGameKey(TEST_SOURCE_ID, TEST_GAME_KEY);

    // Đặt lịch fetch trong TƯƠNG LAI xa — không nên xuất hiện ở findDue(now).
    await repo.recordSuccess(cursor!.id, {
      lastConfirmedPeriod: "0003000",
      nextExpectedPeriod: "0003001",
      nextFetchAt: new Date(Date.now() + 3_600_000),
    });

    const dueNow = await repo.findDue(new Date(), 500);
    expect(dueNow.some((c) => c.sourceId === TEST_SOURCE_ID)).toBe(false);

    const dueFuture = await repo.findDue(new Date(Date.now() + 3_600_000 + 1000), 500);
    expect(dueFuture.some((c) => c.sourceId === TEST_SOURCE_ID)).toBe(true);
  });
});
