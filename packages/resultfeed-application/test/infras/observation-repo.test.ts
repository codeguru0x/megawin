/**
 * ResultFeed – Integration test: ObservationRepository
 *
 * Trọng tâm: idempotency của `upsertObservation` theo khoá
 * `{sourceId, gameKey, drawPeriod, parserVersion}` — parse lại CÙNG version không tạo doc mới,
 * bump version tạo doc MỚI (giữ bản cũ để so sánh).
 */

import type { ObservationDoc, ResultFeedSourceId } from "@megawin/resultfeed/entities";
import { IntrinsicState, ResultFeedGameKey } from "@megawin/resultfeed/entities";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ObservationRepository } from "../../src/infras/repos/observation-repo";

const TEST_DRAW_PERIOD = "9999901";
// Sentinel test source id — cast vì `ResultFeedSourceId` là literal union hardcode (chỉ chứa
// nguồn thật, xem `enums.ts`), không có nghĩa các nguồn test này phải nằm trong danh sách đó.
const TEST_SOURCE_A = "test-observation-repo-src-a" as ResultFeedSourceId;
const TEST_SOURCE_B = "test-observation-repo-src-b" as ResultFeedSourceId;

const repo = new ObservationRepository();

function makeObservation(
  overrides: Partial<Omit<ObservationDoc, "_id" | "createdAt" | "updatedAt">> = {},
): Omit<ObservationDoc, "_id" | "createdAt" | "updatedAt"> {
  return {
    sourceId: TEST_SOURCE_A,
    gameKey: ResultFeedGameKey.Keno,
    drawPeriod: TEST_DRAW_PERIOD,
    drawDateSource: "2999-01-01",
    drawTimeSource: null,
    numbersDisplay: ["01", "02", "03"],
    numbersCanonical: ["01", "02", "03"],
    displayHash: "display-hash-1",
    payoutHash: "payout-hash-1",
    claimedChecksums: {},
    intrinsicState: IntrinsicState.NotAvailable,
    intrinsicMismatch: null,
    parserVersion: "v1",
    submissionId: "000000000000000000000001",
    ...overrides,
  };
}

async function cleanup(): Promise<void> {
  await repo.deleteMany({
    drawPeriod: TEST_DRAW_PERIOD,
    sourceId: TEST_SOURCE_A,
  });
  await repo.deleteMany({
    drawPeriod: TEST_DRAW_PERIOD,
    sourceId: TEST_SOURCE_B,
  });
}

beforeAll(cleanup);
afterAll(cleanup);

describe("ObservationRepository.upsertObservation — idempotent theo {sourceId, gameKey, drawPeriod, parserVersion}", () => {
  it("gọi 2 lần CÙNG parserVersion → chỉ 1 doc, field mới nhất được ghi", async () => {
    await repo.upsertObservation(makeObservation({ payoutHash: "hash-round-1" }));
    await repo.upsertObservation(makeObservation({ payoutHash: "hash-round-2" }));

    const docs = await repo.findByGameKeyAndPeriod(ResultFeedGameKey.Keno, TEST_DRAW_PERIOD);
    const fromA = docs.filter((d) => d.sourceId === TEST_SOURCE_A);

    expect(fromA).toHaveLength(1); // KHÔNG double-insert.
    expect(fromA[0]!.payoutHash).toBe("hash-round-2"); // Ghi đè bằng giá trị mới nhất.
  });

  it("bump parserVersion → tạo doc MỚI, giữ lại bản cũ (audit trước/sau khi đổi parser)", async () => {
    await repo.upsertObservation(makeObservation({ parserVersion: "v2", payoutHash: "hash-v2" }));

    const docs = await repo.findByGameKeyAndPeriod(ResultFeedGameKey.Keno, TEST_DRAW_PERIOD);
    const fromA = docs.filter((d) => d.sourceId === TEST_SOURCE_A);

    expect(fromA).toHaveLength(2); // v1 (đã ghi ở test trước) + v2.
    const versions = fromA.map((d) => d.parserVersion).toSorted();
    expect(versions).toEqual(["v1", "v2"]);
  });

  it("2 nguồn khác nhau cùng game × kỳ → findByGameKeyAndPeriod trả cả 2", async () => {
    await repo.upsertObservation(
      makeObservation({
        sourceId: TEST_SOURCE_B,
        numbersDisplay: ["04", "05", "06"],
        payoutHash: "hash-source-b",
      }),
    );

    const docs = await repo.findByGameKeyAndPeriod(ResultFeedGameKey.Keno, TEST_DRAW_PERIOD);
    const sourceIds = new Set(docs.map((d) => d.sourceId));

    expect(sourceIds.has(TEST_SOURCE_A)).toBe(true);
    expect(sourceIds.has(TEST_SOURCE_B)).toBe(true);
  });
});

describe("ObservationRepository.findRecentByGameKey — sort createdAt desc", () => {
  it("chứa observation vừa ghi cho game Keno", async () => {
    const recent = await repo.findRecentByGameKey(ResultFeedGameKey.Keno, 200);
    const sourceIds = new Set(recent.filter((d) => d.drawPeriod === TEST_DRAW_PERIOD).map((d) => d.sourceId));

    expect(sourceIds.has(TEST_SOURCE_A)).toBe(true);
    expect(sourceIds.has(TEST_SOURCE_B)).toBe(true);
  });
});
