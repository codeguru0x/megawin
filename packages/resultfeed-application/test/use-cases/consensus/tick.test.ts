/**
 * ResultFeed – Integration test: ConsensusTickUseCase
 *
 * Test tích hợp thật với DB (không mock) — theo tiền lệ
 * `game-power655-application/test/use-cases/global-config.test.ts`. Đi qua ĐÚNG đường thật
 * (SourceRepository/ObservationRepository seed → `ConsensusTickUseCase.run()` → đọc lại
 * `ConsensusRepository`/`AlertRepository`) — KHÔNG mock `decideConsensus`, để bắt đúng lỗi
 * tích hợp giữa các tầng.
 *
 * `resolveLockKey()` của use-case là hằng số GLOBAL (`"resultfeed:consensus:tick"`, không
 * theo input) — mỗi lần `.run()` acquire rồi release NGAY trong cùng lời gọi (`SingleRunWorker`
 * lifecycle), nên gọi nhiều lần liên tiếp trong file này an toàn, không cần dọn lock giữa test.
 */

import type { AlertEntity, ResultFeedProviderId, ResultFeedSourceId } from "@megawin/resultfeed/entities";
import {
  ConsensusState,
  IntrinsicState,
  ResultFeedAlertType,
  ResultFeedGameKey,
  SourceRole,
} from "@megawin/resultfeed/entities";
import { isWorkerRunSkipped } from "@megawin/worker-core/workers";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { AlertRepository } from "../../../src/infras/repos/alert-repo";
import { ConsensusRepository } from "../../../src/infras/repos/consensus-repo";
import { ObservationRepository } from "../../../src/infras/repos/observation-repo";
import { SourceRepository } from "../../../src/infras/repos/source-repo";
import type { ConsensusTickRunResult } from "../../../src/use-cases/consensus/tick";
import { ConsensusTickUseCase } from "../../../src/use-cases/consensus/tick";

// Sentinel test source id — cast vì `ResultFeedSourceId` là literal union hardcode (chỉ chứa
// nguồn thật, xem `enums.ts`), không có nghĩa các nguồn test này phải nằm trong danh sách đó.
const TEST_SOURCE_AUTH = "test-tick-authoritative" as ResultFeedSourceId;
const TEST_SOURCE_CONFIRM = "test-tick-confirming" as ResultFeedSourceId;
const TEST_PROVIDER_ID = "test-provider" as ResultFeedProviderId;
const TEST_DRAW_PERIOD_AGREED = "9999801";
const TEST_DRAW_PERIOD_CONFLICT = "9999802";
const TEST_DRAW_PERIOD_HUMAN = "9999803";
const TEST_DRAW_PERIOD_AUTOPUB = "9999804";

const sourceRepo = new SourceRepository();
const observationRepo = new ObservationRepository();
const consensusRepo = new ConsensusRepository();
const alertRepo = new AlertRepository();

/** 20 số hợp lệ Keno, KHÔNG trùng — dùng chung cho mọi test, chỉ đổi payoutHash bằng cách đổi 1 số. */
const KENO_NUMBERS_A = [
  "01",
  "02",
  "03",
  "04",
  "05",
  "06",
  "07",
  "08",
  "09",
  "10",
  "11",
  "12",
  "13",
  "14",
  "15",
  "16",
  "17",
  "18",
  "19",
  "20",
];
const KENO_NUMBERS_B = [
  "21",
  "22",
  "23",
  "24",
  "25",
  "26",
  "27",
  "28",
  "29",
  "30",
  "31",
  "32",
  "33",
  "34",
  "35",
  "36",
  "37",
  "38",
  "39",
  "40",
];

async function seedObservation(input: {
  sourceId: ResultFeedSourceId;
  drawPeriod: string;
  numbers: string[];
  intrinsicState?: IntrinsicState;
}): Promise<void> {
  const canonical = [...input.numbers].sort((a, b) => a.localeCompare(b));
  await observationRepo.upsertObservation({
    sourceId: input.sourceId,
    gameKey: ResultFeedGameKey.Keno,
    drawPeriod: input.drawPeriod,
    drawDateSource: "2999-01-01",
    drawTimeSource: null,
    numbersDisplay: input.numbers,
    numbersCanonical: canonical,
    displayHash: `display-${input.sourceId}-${input.drawPeriod}-${input.numbers.join("")}`,
    payoutHash: `payout-${canonical.join("")}`,
    claimedChecksums: {},
    intrinsicState: input.intrinsicState ?? IntrinsicState.Passed,
    intrinsicMismatch: null,
    parserVersion: "v1",
    submissionId: "000000000000000000000001",
  });
}

async function cleanup(): Promise<void> {
  await sourceRepo.deleteMany({ sourceId: TEST_SOURCE_AUTH });
  await sourceRepo.deleteMany({ sourceId: TEST_SOURCE_CONFIRM });
  for (const drawPeriod of [
    TEST_DRAW_PERIOD_AGREED,
    TEST_DRAW_PERIOD_CONFLICT,
    TEST_DRAW_PERIOD_HUMAN,
    TEST_DRAW_PERIOD_AUTOPUB,
  ]) {
    await observationRepo.deleteMany({ gameKey: ResultFeedGameKey.Keno, drawPeriod });
    await consensusRepo.deleteMany({ gameKey: ResultFeedGameKey.Keno, drawPeriod });
  }
  await alertRepo.deleteMany({
    dedupeKey: `consensus_conflict:${ResultFeedGameKey.Keno}:${TEST_DRAW_PERIOD_CONFLICT}`,
  });
}

beforeEach(cleanup); // Mỗi test tự seed từ đầu — tránh phụ thuộc thứ tự chạy.
afterAll(cleanup);

/** Chạy tick, throw nếu bị skip (locked/disabled) — test này giả định lock trống. */
async function runTick(autoPublishUnverified: boolean): Promise<ConsensusTickRunResult> {
  const result = await new ConsensusTickUseCase({ autoPublishUnverified }).run();
  if (isWorkerRunSkipped(result)) {
    throw new Error(`ConsensusTickUseCase bị skip (reason=${result.reason}) — không mong đợi trong test.`);
  }
  return result;
}

describe("ConsensusTickUseCase — 1 nguồn Authoritative duy nhất", () => {
  beforeEach(async () => {
    await sourceRepo.upsertBySourceId(TEST_SOURCE_AUTH, {
      name: "Test Authoritative",
      baseUrl: "https://example.test",
      role: SourceRole.Authoritative,
      trustWeight: 100,
      gameKeys: [ResultFeedGameKey.Keno],
      isEnabled: true,
      providerId: TEST_PROVIDER_ID,
      parserVersion: "v1",
      requiresRender: false,
      minIntervalMs: 5000,
    });
  });

  it("observation Passed → state=Agreed, publishedAt=null khi autoPublishUnverified=false", async () => {
    await seedObservation({
      sourceId: TEST_SOURCE_AUTH,
      drawPeriod: TEST_DRAW_PERIOD_AGREED,
      numbers: KENO_NUMBERS_A,
    });

    const result = await runTick(false);
    expect(result.evaluated).toBeGreaterThanOrEqual(1);
    expect(result.agreed).toBeGreaterThanOrEqual(1);

    const doc = await consensusRepo.findByGameKeyAndPeriod(ResultFeedGameKey.Keno, TEST_DRAW_PERIOD_AGREED);
    expect(doc).not.toBeNull();
    expect(doc!.state).toBe(ConsensusState.Agreed);
    expect(doc!.numbers).toEqual(KENO_NUMBERS_A);
    expect(doc!.publishedAt).toBeNull();
    expect(doc!.agreeing).toHaveLength(1);
    expect(doc!.agreeing[0]!.sourceId).toBe(TEST_SOURCE_AUTH);
  });

  it("autoPublishUnverified=true → state=Agreed VÀ publishedAt được set ngay (03-consensus §6.1)", async () => {
    await seedObservation({
      sourceId: TEST_SOURCE_AUTH,
      drawPeriod: TEST_DRAW_PERIOD_AUTOPUB,
      numbers: KENO_NUMBERS_A,
    });

    await runTick(true);

    const doc = await consensusRepo.findByGameKeyAndPeriod(ResultFeedGameKey.Keno, TEST_DRAW_PERIOD_AUTOPUB);
    expect(doc!.state).toBe(ConsensusState.Agreed);
    expect(doc!.publishedAt).not.toBeNull();
  });

  it("observation IntrinsicState.NotAvailable (chưa Passed) → state vẫn Pending, KHÔNG tự Agreed", async () => {
    await seedObservation({
      sourceId: TEST_SOURCE_AUTH,
      drawPeriod: TEST_DRAW_PERIOD_AGREED,
      numbers: KENO_NUMBERS_A,
      intrinsicState: IntrinsicState.NotAvailable,
    });

    await runTick(false);

    const doc = await consensusRepo.findByGameKeyAndPeriod(ResultFeedGameKey.Keno, TEST_DRAW_PERIOD_AGREED);
    expect(doc!.state).toBe(ConsensusState.Pending);
    expect(doc!.numbers).toBeNull();
  });

  it("đã human_verified trước đó → tick KHÔNG ghi đè dù có observation mới đổi (D6)", async () => {
    await seedObservation({
      sourceId: TEST_SOURCE_AUTH,
      drawPeriod: TEST_DRAW_PERIOD_HUMAN,
      numbers: KENO_NUMBERS_A,
    });
    await runTick(false); // Tạo doc Agreed trước.

    const before = await consensusRepo.findByGameKeyAndPeriod(ResultFeedGameKey.Keno, TEST_DRAW_PERIOD_HUMAN);
    await consensusRepo.setHumanVerified(before!.id, {
      numbers: ["77", "78"],
      payoutHash: "hash-human-final",
      displayHash: "hash-human-final-display",
      humanVerify: {
        accountId: "acc-test",
        username: "tester",
        verifiedAt: new Date(),
        note: "Chốt tay để test bất biến D6",
        chosenObservationId: null,
      },
    });

    // Observation đổi SAU khi human verify — updatedAt mới hơn cursor, tick sẽ tính lại kỳ này.
    await seedObservation({
      sourceId: TEST_SOURCE_AUTH,
      drawPeriod: TEST_DRAW_PERIOD_HUMAN,
      numbers: KENO_NUMBERS_B,
    });
    await runTick(false);

    const after = await consensusRepo.findByGameKeyAndPeriod(ResultFeedGameKey.Keno, TEST_DRAW_PERIOD_HUMAN);
    expect(after!.state).toBe(ConsensusState.HumanVerified);
    expect(after!.numbers).toEqual(["77", "78"]); // KHÔNG bị máy ghi đè.
  });
});

describe("ConsensusTickUseCase — 2 nguồn (Authoritative + Confirming)", () => {
  beforeEach(async () => {
    await sourceRepo.upsertBySourceId(TEST_SOURCE_AUTH, {
      name: "Test Authoritative",
      baseUrl: "https://example.test",
      role: SourceRole.Authoritative,
      trustWeight: 100,
      gameKeys: [ResultFeedGameKey.Keno],
      isEnabled: true,
      providerId: TEST_PROVIDER_ID,
      parserVersion: "v1",
      requiresRender: false,
      minIntervalMs: 5000,
    });
    await sourceRepo.upsertBySourceId(TEST_SOURCE_CONFIRM, {
      name: "Test Confirming",
      baseUrl: "https://example2.test",
      role: SourceRole.Confirming,
      trustWeight: 60,
      gameKeys: [ResultFeedGameKey.Keno],
      isEnabled: true,
      providerId: TEST_PROVIDER_ID,
      parserVersion: "v1",
      requiresRender: false,
      minIntervalMs: 5000,
    });
  });

  it("cùng payoutHash (2 nguồn khớp số) → Agreed, agreeing chứa cả 2 nguồn", async () => {
    await seedObservation({ sourceId: TEST_SOURCE_AUTH, drawPeriod: TEST_DRAW_PERIOD_AGREED, numbers: KENO_NUMBERS_A });
    await seedObservation({
      sourceId: TEST_SOURCE_CONFIRM,
      drawPeriod: TEST_DRAW_PERIOD_AGREED,
      numbers: KENO_NUMBERS_A,
    });

    await runTick(false);

    const doc = await consensusRepo.findByGameKeyAndPeriod(ResultFeedGameKey.Keno, TEST_DRAW_PERIOD_AGREED);
    expect(doc!.state).toBe(ConsensusState.Agreed);
    const agreeingSourceIds = doc!.agreeing.map((a) => a.sourceId).toSorted();
    expect(agreeingSourceIds).toEqual([TEST_SOURCE_AUTH, TEST_SOURCE_CONFIRM].toSorted());
  });

  it("payoutHash KHÁC nhau (policy mặc định HumanOnly) → Conflict + ghi alert consensus_conflict", async () => {
    await seedObservation({
      sourceId: TEST_SOURCE_AUTH,
      drawPeriod: TEST_DRAW_PERIOD_CONFLICT,
      numbers: KENO_NUMBERS_A,
    });
    await seedObservation({
      sourceId: TEST_SOURCE_CONFIRM,
      drawPeriod: TEST_DRAW_PERIOD_CONFLICT,
      numbers: KENO_NUMBERS_B,
    });

    const result = await runTick(false);
    expect(result.conflicted).toBeGreaterThanOrEqual(1);

    const doc = await consensusRepo.findByGameKeyAndPeriod(ResultFeedGameKey.Keno, TEST_DRAW_PERIOD_CONFLICT);
    expect(doc!.state).toBe(ConsensusState.Conflict);
    expect(doc!.numbers).toBeNull();
    expect(doc!.conflicting).toHaveLength(1);
    expect(doc!.conflicting[0]!.sourceId).toBe(TEST_SOURCE_CONFIRM);

    const alerts = await alertRepo.findMany({
      dedupeKey: `consensus_conflict:${ResultFeedGameKey.Keno}:${TEST_DRAW_PERIOD_CONFLICT}`,
    });
    expect(alerts).toHaveLength(1);
    const alert = alerts[0] as AlertEntity;
    expect(alert.type).toBe(ResultFeedAlertType.ConsensusConflict);
  });
});
