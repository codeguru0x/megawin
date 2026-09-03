/**
 * ResultFeed – Integration test: SubmissionRepository
 *
 * Bằng chứng thô là BẤT BIẾN sau khi ghi — test tập trung vào dedupe theo `contentHash` và
 * chuyển trạng thái parse. Dùng `sourceId` sentinel riêng cho file này, cleanup `afterAll`.
 */

import type { ResultFeedProviderId, ResultFeedSourceId, SubmissionDoc } from "@megawin/resultfeed/entities";
import { ResultFeedGameKey, SubmissionState } from "@megawin/resultfeed/entities";
import { Binary } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { SubmissionRepository } from "../../src/infras/repos/submission-repo";

// Sentinel test source id — cast vì `ResultFeedSourceId` là literal union hardcode (chỉ chứa
// nguồn thật, xem `enums.ts`), không có nghĩa nguồn test này phải nằm trong danh sách đó.
const TEST_SOURCE_ID = "test-submission-repo-src" as ResultFeedSourceId;

const repo = new SubmissionRepository();

function makeSubmission(
  overrides: Partial<Omit<SubmissionDoc, "_id" | "seenCount" | "lastSeenAt" | "lastRequestUrl">> = {},
): Omit<SubmissionDoc, "_id" | "seenCount" | "lastSeenAt" | "lastRequestUrl"> {
  return {
    sourceId: TEST_SOURCE_ID,
    gameKey: ResultFeedGameKey.Keno,
    requestUrl: "https://example.test/keno",
    httpStatus: 200,
    contentType: "text/html",
    bodyGz: new Binary(Buffer.from("fake-gzip-body")),
    contentHash: "test-hash-default",
    bodyBytes: 1234,
    providerId: "test-provider" as ResultFeedProviderId,
    elapsedMs: 100,
    state: SubmissionState.Fetched,
    failureReason: null,
    fetchedAt: new Date(),
    ...overrides,
  };
}

async function cleanup(): Promise<void> {
  await repo.deleteMany({ sourceId: TEST_SOURCE_ID });
}

beforeAll(cleanup);
afterAll(cleanup);

describe("SubmissionRepository.upsertSubmission + findByContentHash — dedupe", () => {
  it("upsert xong → tìm lại được bằng đúng sourceId + contentHash, seenCount = 1", async () => {
    const id = await repo.upsertSubmission(makeSubmission({ contentHash: "hash-A" }));
    expect(id).toBeTruthy();

    const found = await repo.findByContentHash(TEST_SOURCE_ID, "hash-A");
    expect(found).not.toBeNull();
    expect(found!.id).toBe(id);
    expect(found!.state).toBe(SubmissionState.Fetched);
    expect(found!.bodyBytes).toBe(1234);
    expect(found!.seenCount).toBe(1);
    expect(found!.lastSeenAt).toEqual(found!.fetchedAt);
  });

  it("contentHash khác (chưa từng fetch) → null, không nhận nhầm submission khác", async () => {
    const found = await repo.findByContentHash(TEST_SOURCE_ID, "hash-never-seen");
    expect(found).toBeNull();
  });
});

describe("SubmissionRepository.upsertSubmission — idempotent theo {sourceId, contentHash}", () => {
  it("fetch lại ra ĐÚNG bytes cũ → KHÔNG throw duplicate key, trả về cùng id, seenCount tăng", async () => {
    // Đây chính là hình dạng của một sự cố kéo dài: site/vendor trả cùng một trang lỗi
    // (Cloudflare block, "kỳ không tồn tại") cho nhiều URL khác nhau ⇒ contentHash trùng.
    // insertOne thuần sẽ throw 11000 và làm sập worker TRƯỚC khi kịp ghi alert.
    const first = await repo.upsertSubmission(
      makeSubmission({
        contentHash: "hash-repeat",
        requestUrl: "https://example.test/keno?id=0000001",
      }),
    );
    const second = await repo.upsertSubmission(
      makeSubmission({
        contentHash: "hash-repeat",
        requestUrl: "https://example.test/keno?id=0000002",
      }),
    );

    expect(second).toBe(first);

    const found = await repo.findByContentHash(TEST_SOURCE_ID, "hash-repeat");
    expect(found!.seenCount).toBe(2);
    // Field bằng chứng bất biến — giữ URL LẦN ĐẦU.
    expect(found!.requestUrl).toBe("https://example.test/keno?id=0000001");
    // URL gần nhất cập nhật — không có field này thì không hiểu vì sao seenCount lớn.
    expect(found!.lastRequestUrl).toBe("https://example.test/keno?id=0000002");
  });

  it("state đã `parsed` KHÔNG tụt về `fetched` khi nhận lại đúng bytes đó", async () => {
    // Nếu state nằm trong `$set` thay vì `$setOnInsert`, doc đã parse sẽ bị đẩy về `fetched`
    // ⇒ TTL retention (partialFilter `state: "parsed"`) lỡ nhịp, và hàng đợi parse bị bẩn.
    const id = await repo.upsertSubmission(makeSubmission({ contentHash: "hash-state-stable" }));
    await repo.markParsed(id);

    await repo.upsertSubmission(makeSubmission({ contentHash: "hash-state-stable" }));

    const found = await repo.findByContentHash(TEST_SOURCE_ID, "hash-state-stable");
    expect(found!.state).toBe(SubmissionState.Parsed);
    expect(found!.seenCount).toBe(2);
  });
});

describe("SubmissionRepository — chuyển trạng thái parse", () => {
  it("markParsed → state=parsed, failureReason=null", async () => {
    const id = await repo.upsertSubmission(makeSubmission({ contentHash: "hash-parsed" }));

    const applied = await repo.markParsed(id);
    expect(applied).toBe(true);

    const found = await repo.findByContentHash(TEST_SOURCE_ID, "hash-parsed");
    expect(found!.state).toBe(SubmissionState.Parsed);
    expect(found!.failureReason).toBeNull();
  });

  it("markParseFailed → state=parse_failed, failureReason ghi lại lý do", async () => {
    const id = await repo.upsertSubmission(makeSubmission({ contentHash: "hash-parse-failed" }));

    const applied = await repo.markParseFailed(id, "Không tìm thấy bảng kết quả");
    expect(applied).toBe(true);

    const found = await repo.findByContentHash(TEST_SOURCE_ID, "hash-parse-failed");
    expect(found!.state).toBe(SubmissionState.ParseFailed);
    expect(found!.failureReason).toBe("Không tìm thấy bảng kết quả");
  });

  it("findParseFailedQueue → chỉ chứa submission parse_failed, không chứa parsed/fetched", async () => {
    const queue = await repo.findParseFailedQueue(100);
    const testItems = queue.filter((s) => s.sourceId === TEST_SOURCE_ID);

    expect(testItems.length).toBeGreaterThanOrEqual(1);
    for (const item of testItems) {
      expect(item.state).toBe(SubmissionState.ParseFailed);
    }
  });

  it("markUnavailable → state=unavailable, failureReason ghi lại lý do (KHÔNG phải parse_failed)", async () => {
    // Phân biệt với `markParseFailed`: đây là trạng thái BÌNH THƯỜNG (kỳ chưa có kết quả),
    // không phải lỗi cấu trúc HTML — xem JSDoc `ResultUnavailableError`.
    const id = await repo.upsertSubmission(makeSubmission({ contentHash: "hash-unavailable" }));

    const applied = await repo.markUnavailable(id, "Trang báo 'Không tìm thấy kết quả'");
    expect(applied).toBe(true);

    const found = await repo.findByContentHash(TEST_SOURCE_ID, "hash-unavailable");
    expect(found!.state).toBe(SubmissionState.Unavailable);
    expect(found!.failureReason).toBe("Trang báo 'Không tìm thấy kết quả'");
  });
});

describe("SubmissionRepository.findRecentByGameKey — sort fetchedAt desc", () => {
  it("submission fetch sau xuất hiện TRƯỚC trong danh sách", async () => {
    const older = new Date(Date.now() - 60_000);
    const newer = new Date();

    await repo.upsertSubmission(makeSubmission({ contentHash: "hash-older", fetchedAt: older }));
    await repo.upsertSubmission(makeSubmission({ contentHash: "hash-newer", fetchedAt: newer }));

    const recent = await repo.findRecentByGameKey(ResultFeedGameKey.Keno, 100);
    const testItems = recent.filter((s) => s.sourceId === TEST_SOURCE_ID);
    const hashes = testItems.map((s) => s.contentHash);

    expect(hashes.indexOf("hash-newer")).toBeLessThan(hashes.indexOf("hash-older"));
  });
});
