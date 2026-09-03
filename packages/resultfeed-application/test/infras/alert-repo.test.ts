/**
 * ResultFeed – Integration test: AlertRepository
 *
 * Trọng tâm: `upsertByDedupeKey` chống bắn trùng alert (idempotent theo `dedupeKey`) và KHÔNG
 * reset trạng thái xử lý (`status`) của vận hành khi alert vẫn còn hiệu lực.
 */

import { ResultFeedAlertSeverity, ResultFeedAlertStatus, ResultFeedAlertType } from "@megawin/resultfeed/entities";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { AlertRepository } from "../../src/infras/repos/alert-repo";

const TEST_DEDUPE_KEY = "test-alert-repo-dedupe-key";

const repo = new AlertRepository();

async function cleanup(): Promise<void> {
  await repo.deleteMany({ dedupeKey: TEST_DEDUPE_KEY });
}

beforeEach(cleanup);
afterAll(cleanup);

describe("AlertRepository.upsertByDedupeKey — idempotent theo dedupeKey", () => {
  it("lần đầu → tạo alert mới với status=new", async () => {
    await repo.upsertByDedupeKey({
      type: ResultFeedAlertType.FetchFailing,
      severity: ResultFeedAlertSeverity.Warning,
      payload: { sourceId: "test-src", consecutiveFailures: 3 },
      dedupeKey: TEST_DEDUPE_KEY,
    });

    const items = await repo.findByStatus(ResultFeedAlertStatus.New, 100);
    const found = items.find((a) => a.dedupeKey === TEST_DEDUPE_KEY);

    expect(found).toBeDefined();
    expect(found!.type).toBe(ResultFeedAlertType.FetchFailing);
    expect(found!.severity).toBe(ResultFeedAlertSeverity.Warning);
    expect(found!.payload).toEqual({
      sourceId: "test-src",
      consecutiveFailures: 3,
    });
  });

  it("gọi lại CÙNG dedupeKey (chưa ack) → cập nhật severity/payload, KHÔNG tạo alert thứ 2", async () => {
    await repo.upsertByDedupeKey({
      type: ResultFeedAlertType.FetchFailing,
      severity: ResultFeedAlertSeverity.Warning,
      payload: { consecutiveFailures: 3 },
      dedupeKey: TEST_DEDUPE_KEY,
    });
    await repo.upsertByDedupeKey({
      type: ResultFeedAlertType.FetchFailing,
      severity: ResultFeedAlertSeverity.Critical,
      payload: { consecutiveFailures: 10 },
      dedupeKey: TEST_DEDUPE_KEY,
    });

    const all = await repo.findByStatus(ResultFeedAlertStatus.New, 100);
    const matches = all.filter((a) => a.dedupeKey === TEST_DEDUPE_KEY);

    expect(matches).toHaveLength(1); // KHÔNG double-insert.
    expect(matches[0]!.severity).toBe(ResultFeedAlertSeverity.Critical);
    expect(matches[0]!.payload).toEqual({ consecutiveFailures: 10 });
  });

  it("alert đã ACK → gọi lại upsertByDedupeKey KHÔNG reset status về new", async () => {
    await repo.upsertByDedupeKey({
      type: ResultFeedAlertType.FetchFailing,
      severity: ResultFeedAlertSeverity.Warning,
      payload: {},
      dedupeKey: TEST_DEDUPE_KEY,
    });
    const created = (await repo.findByStatus(ResultFeedAlertStatus.New, 100)).find(
      (a) => a.dedupeKey === TEST_DEDUPE_KEY,
    )!;

    await repo.ack(created.id, "op1");

    // Alert vẫn còn hiệu lực (evaluator chạy tick tiếp) → upsert lại cùng dedupeKey.
    await repo.upsertByDedupeKey({
      type: ResultFeedAlertType.FetchFailing,
      severity: ResultFeedAlertSeverity.Critical,
      payload: { consecutiveFailures: 20 },
      dedupeKey: TEST_DEDUPE_KEY,
    });

    const afterAck = await repo.findByStatus(ResultFeedAlertStatus.Ack, 100);
    const found = afterAck.find((a) => a.dedupeKey === TEST_DEDUPE_KEY);

    expect(found).toBeDefined(); // Vẫn ở status=ack, KHÔNG bị reset về new.
    expect(found!.severity).toBe(ResultFeedAlertSeverity.Critical); // Nhưng payload/severity vẫn cập nhật.
    expect(found!.ackBy).toBe("op1");
  });
});

describe("AlertRepository.countNew + resolve", () => {
  it("countNew đếm đúng, resolve chuyển sang status=resolved và KHÔNG còn trong countNew", async () => {
    await repo.upsertByDedupeKey({
      type: ResultFeedAlertType.ParseFailed,
      severity: ResultFeedAlertSeverity.Info,
      payload: {},
      dedupeKey: TEST_DEDUPE_KEY,
    });

    const countBefore = await repo.countNew();
    expect(countBefore).toBeGreaterThanOrEqual(1);

    const created = (await repo.findByStatus(ResultFeedAlertStatus.New, 100)).find(
      (a) => a.dedupeKey === TEST_DEDUPE_KEY,
    )!;
    await repo.resolve(created.id);

    const resolved = await repo.findByStatus(ResultFeedAlertStatus.Resolved, 100);
    expect(resolved.some((a) => a.dedupeKey === TEST_DEDUPE_KEY)).toBe(true);

    const stillNew = await repo.findByStatus(ResultFeedAlertStatus.New, 100);
    expect(stillNew.some((a) => a.dedupeKey === TEST_DEDUPE_KEY)).toBe(false);
  });
});
