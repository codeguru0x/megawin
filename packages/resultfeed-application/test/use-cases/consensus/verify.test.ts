/**
 * ResultFeed – Integration test: VerifyConsensusUseCase & RejectConsensusUseCase
 *
 * Test tích hợp thật với DB (không mock) — theo tiền lệ
 * `game-power655-application/test/use-cases/global-config.test.ts`. `record()` (audit) chạy
 * fire-and-forget thật (ghi `audit_logs` thật) — KHÔNG mock, giống cách package khác test use-case
 * có audit (`global-config.test.ts` dùng `systemActor()` không mock `record`); không assert trực
 * tiếp nội dung audit ở đây (không có tiền lệ nào trong monorepo làm vậy), chỉ xác nhận
 * `record()` không throw ra ngoài use-case.
 */

import type { AuditActor } from "@megawin/audit/logger";
import {
  ConflictPolicy,
  ConsensusState,
  DecidedBy,
  IntrinsicState,
  ResultFeedGameKey,
} from "@megawin/resultfeed/entities";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { ConsensusRepository } from "../../../src/infras/repos/consensus-repo";
import { ObservationRepository } from "../../../src/infras/repos/observation-repo";
import { RejectConsensusUseCase, VerifyConsensusUseCase } from "../../../src/use-cases/consensus/verify";

const TEST_SOURCE_A = "test-verify-src-a";
const TEST_DRAW_PERIOD_1 = "9999701";
const TEST_DRAW_PERIOD_2 = "9999702";
const TEST_DRAW_PERIOD_3 = "9999703";

const consensusRepo = new ConsensusRepository();
const observationRepo = new ObservationRepository();

const testActor: AuditActor = {
  id: "test-verify-consensus",
  type: "system",
  name: "test-verify-consensus",
  roles: [],
  tenantId: "",
};

async function cleanup(): Promise<void> {
  for (const drawPeriod of [TEST_DRAW_PERIOD_1, TEST_DRAW_PERIOD_2, TEST_DRAW_PERIOD_3]) {
    await consensusRepo.deleteMany({ gameKey: ResultFeedGameKey.Keno, drawPeriod });
    await observationRepo.deleteMany({ gameKey: ResultFeedGameKey.Keno, drawPeriod });
  }
}

beforeEach(cleanup);
afterAll(cleanup);

describe("VerifyConsensusUseCase — chọn observation làm chuẩn", () => {
  it("chosenObservationId hợp lệ, KHÔNG khác máy → verify thành công, KHÔNG cần note", async () => {
    await consensusRepo.ensurePendingDoc(
      ResultFeedGameKey.Keno,
      TEST_DRAW_PERIOD_1,
      "2999-01-01",
      ConflictPolicy.HumanOnly,
    );
    const before = await consensusRepo.findByGameKeyAndPeriod(ResultFeedGameKey.Keno, TEST_DRAW_PERIOD_1);

    await observationRepo.upsertObservation({
      sourceId: TEST_SOURCE_A,
      gameKey: ResultFeedGameKey.Keno,
      drawPeriod: TEST_DRAW_PERIOD_1,
      drawDateSource: "2999-01-01",
      drawTimeSource: null,
      numbersDisplay: ["01", "02", "03"],
      numbersCanonical: ["01", "02", "03"],
      displayHash: "display-1",
      payoutHash: "payout-1",
      claimedChecksums: {},
      intrinsicState: IntrinsicState.NotAvailable,
      intrinsicMismatch: null,
      parserVersion: "v1",
      submissionId: "000000000000000000000001",
    });
    const observations = await observationRepo.findByGameKeyAndPeriod(ResultFeedGameKey.Keno, TEST_DRAW_PERIOD_1);
    const observation = observations[0]!;

    const useCase = new VerifyConsensusUseCase();
    const result = await useCase.run({
      gameKey: ResultFeedGameKey.Keno,
      drawPeriod: TEST_DRAW_PERIOD_1,
      chosenObservationId: observation.id,
      actor: testActor,
    });

    expect(result.numbers).toEqual(["01", "02", "03"]);

    const after = await consensusRepo.findByGameKeyAndPeriod(ResultFeedGameKey.Keno, TEST_DRAW_PERIOD_1);
    expect(after!.state).toBe(ConsensusState.HumanVerified);
    expect(after!.decidedBy).toBe(DecidedBy.Human);
    expect(after!.humanVerify).not.toBeNull();
    expect(after!.humanVerify!.chosenObservationId).toBe(observation.id);
    expect(after!.humanVerify!.note).toBeNull();
    expect(after!.publishedAt).not.toBeNull(); // setHumanVerified luôn publish ngay.
    expect(after!.version).toBe((before!.version ?? 0) + 1);
  });

  it("chosenObservationId không tồn tại → throw notFound", async () => {
    await consensusRepo.ensurePendingDoc(
      ResultFeedGameKey.Keno,
      TEST_DRAW_PERIOD_1,
      "2999-01-01",
      ConflictPolicy.HumanOnly,
    );

    const useCase = new VerifyConsensusUseCase();
    await expect(
      useCase.run({
        gameKey: ResultFeedGameKey.Keno,
        drawPeriod: TEST_DRAW_PERIOD_1,
        chosenObservationId: "000000000000000000000099",
        actor: testActor,
      }),
    ).rejects.toThrow();
  });

  it("consensus doc không tồn tại (chưa có observation nào) → throw notFound", async () => {
    const useCase = new VerifyConsensusUseCase();
    await expect(
      useCase.run({
        gameKey: ResultFeedGameKey.Keno,
        drawPeriod: TEST_DRAW_PERIOD_1,
        chosenObservationId: null,
        manualNumbers: ["09", "10"],
        note: "test",
        actor: testActor,
      }),
    ).rejects.toThrow();
  });
});

describe("VerifyConsensusUseCase — nhập tay (manualNumbers)", () => {
  beforeEach(async () => {
    await consensusRepo.ensurePendingDoc(
      ResultFeedGameKey.Keno,
      TEST_DRAW_PERIOD_2,
      "2999-01-02",
      ConflictPolicy.HumanOnly,
    );
  });

  it("nhập tay KHÔNG note → throw badRequest (bắt buộc ghi lý do)", async () => {
    const useCase = new VerifyConsensusUseCase();
    await expect(
      useCase.run({
        gameKey: ResultFeedGameKey.Keno,
        drawPeriod: TEST_DRAW_PERIOD_2,
        chosenObservationId: null,
        manualNumbers: ["09", "10"],
        actor: testActor,
      }),
    ).rejects.toThrow();
  });

  it("nhập tay CÓ note, không có observation nào công bố checksum → verify thành công", async () => {
    const useCase = new VerifyConsensusUseCase();
    const result = await useCase.run({
      gameKey: ResultFeedGameKey.Keno,
      drawPeriod: TEST_DRAW_PERIOD_2,
      chosenObservationId: null,
      manualNumbers: ["09", "10"],
      note: "Không có nguồn nào lấy được, nhập tay theo ảnh chụp trực tiếp",
      actor: testActor,
    });

    expect(result.numbers).toEqual(["09", "10"]);

    const after = await consensusRepo.findByGameKeyAndPeriod(ResultFeedGameKey.Keno, TEST_DRAW_PERIOD_2);
    expect(after!.state).toBe(ConsensusState.HumanVerified);
    expect(after!.humanVerify!.chosenObservationId).toBeNull();
    expect(after!.humanVerify!.note).toBe("Không có nguồn nào lấy được, nhập tay theo ảnh chụp trực tiếp");
  });

  it("nhập tay lệch checksum nguồn công bố, KHÔNG confirmMismatch → throw 409", async () => {
    await observationRepo.upsertObservation({
      sourceId: TEST_SOURCE_A,
      gameKey: ResultFeedGameKey.Keno,
      drawPeriod: TEST_DRAW_PERIOD_2,
      drawDateSource: "2999-01-02",
      drawTimeSource: null,
      numbersDisplay: [
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
      ],
      numbersCanonical: [],
      displayHash: "display-2",
      payoutHash: "payout-2",
      // Checksum "even" cố tình sai để test nhánh mismatch — 20 số 01-20 có 10 số chẵn.
      claimedChecksums: { even: 5 },
      intrinsicState: IntrinsicState.Failed,
      intrinsicMismatch: "even lệch",
      parserVersion: "v1",
      submissionId: "000000000000000000000001",
    });

    const useCase = new VerifyConsensusUseCase();
    await expect(
      useCase.run({
        gameKey: ResultFeedGameKey.Keno,
        drawPeriod: TEST_DRAW_PERIOD_2,
        chosenObservationId: null,
        manualNumbers: [
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
        ],
        note: "Nhập tay theo ảnh chụp",
        actor: testActor,
      }),
    ).rejects.toThrow();
  });

  it("nhập tay lệch checksum, CÓ confirmMismatch=true → verify thành công (đã xác nhận lần 2)", async () => {
    await observationRepo.upsertObservation({
      sourceId: TEST_SOURCE_A,
      gameKey: ResultFeedGameKey.Keno,
      drawPeriod: TEST_DRAW_PERIOD_2,
      drawDateSource: "2999-01-02",
      drawTimeSource: null,
      numbersDisplay: [
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
      ],
      numbersCanonical: [],
      displayHash: "display-2",
      payoutHash: "payout-2",
      claimedChecksums: { even: 5 },
      intrinsicState: IntrinsicState.Failed,
      intrinsicMismatch: "even lệch",
      parserVersion: "v1",
      submissionId: "000000000000000000000001",
    });

    const useCase = new VerifyConsensusUseCase();
    const result = await useCase.run({
      gameKey: ResultFeedGameKey.Keno,
      drawPeriod: TEST_DRAW_PERIOD_2,
      chosenObservationId: null,
      manualNumbers: [
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
      ],
      note: "Nhập tay theo ảnh chụp, xác nhận vẫn dùng số này dù lệch checksum nguồn",
      confirmMismatch: true,
      actor: testActor,
    });

    expect(result.numbers).toHaveLength(20);
    const after = await consensusRepo.findByGameKeyAndPeriod(ResultFeedGameKey.Keno, TEST_DRAW_PERIOD_2);
    expect(after!.state).toBe(ConsensusState.HumanVerified);
  });
});

describe("RejectConsensusUseCase", () => {
  it("reject → state=rejected, numbers/hash về null, publishedAt null", async () => {
    await consensusRepo.ensurePendingDoc(
      ResultFeedGameKey.Keno,
      TEST_DRAW_PERIOD_3,
      "2999-01-03",
      ConflictPolicy.HumanOnly,
    );

    const useCase = new RejectConsensusUseCase();
    const result = await useCase.run({
      gameKey: ResultFeedGameKey.Keno,
      drawPeriod: TEST_DRAW_PERIOD_3,
      note: "Nguồn báo huỷ kỳ quay do lỗi kỹ thuật",
      actor: testActor,
    });

    expect(result.id).toBeTruthy();

    const after = await consensusRepo.findByGameKeyAndPeriod(ResultFeedGameKey.Keno, TEST_DRAW_PERIOD_3);
    expect(after!.state).toBe(ConsensusState.Rejected);
    expect(after!.numbers).toBeNull();
    expect(after!.publishedAt).toBeNull();
    expect(after!.decidedBy).toBe(DecidedBy.Human);
    expect(after!.humanVerify!.note).toBe("Nguồn báo huỷ kỳ quay do lỗi kỹ thuật");
  });

  it("consensus doc không tồn tại → throw notFound", async () => {
    const useCase = new RejectConsensusUseCase();
    await expect(
      useCase.run({
        gameKey: ResultFeedGameKey.Keno,
        drawPeriod: TEST_DRAW_PERIOD_3,
        note: "test",
        actor: testActor,
      }),
    ).rejects.toThrow();
  });
});
