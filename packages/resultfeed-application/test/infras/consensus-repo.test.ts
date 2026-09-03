/**
 * ResultFeed – Integration test: ConsensusRepository
 *
 * Trọng tâm: optimistic lock theo `version` (chống 2 tick worker ghi đè nhau) và bất biến D6
 * "máy KHÔNG BAO GIỜ ghi đè người" (`applyMachineDecision` phải fail khi state đã human_verified).
 */

import type { ConsensusAgreement, ResultFeedSourceId } from "@megawin/resultfeed/entities";
import { ConflictPolicy, ConsensusState, DecidedBy, ResultFeedGameKey, SourceRole } from "@megawin/resultfeed/entities";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { ConsensusRepository } from "../../src/infras/repos/consensus-repo";

const TEST_GAME_KEY = ResultFeedGameKey.Keno;
const TEST_DRAW_PERIOD_1 = "9999911";
const TEST_DRAW_PERIOD_2 = "9999912";
const TEST_DRAW_PERIOD_3 = "9999913";

const repo = new ConsensusRepository();

const agreement: ConsensusAgreement = {
  // Sentinel test source id — cast vì `ResultFeedSourceId` là literal union hardcode (chỉ
  // chứa nguồn thật, xem `enums.ts`), không có nghĩa nguồn test này phải nằm trong danh sách đó.
  sourceId: "test-consensus-repo-src" as ResultFeedSourceId,
  observationId: "000000000000000000000001",
  role: SourceRole.Authoritative,
  trustWeight: 100,
};

async function cleanup(): Promise<void> {
  await repo.deleteMany({
    gameKey: TEST_GAME_KEY,
    drawPeriod: TEST_DRAW_PERIOD_1,
  });
  await repo.deleteMany({
    gameKey: TEST_GAME_KEY,
    drawPeriod: TEST_DRAW_PERIOD_2,
  });
  await repo.deleteMany({
    gameKey: TEST_GAME_KEY,
    drawPeriod: TEST_DRAW_PERIOD_3,
  });
}

beforeEach(cleanup); // Mỗi test tự seed từ đầu — tránh phụ thuộc thứ tự chạy.
afterAll(cleanup);

describe("ConsensusRepository.ensurePendingDoc — idempotent, không ghi đè doc đã tồn tại", () => {
  it("tạo doc pending lần đầu với appliedPolicy = defaultPolicy", async () => {
    await repo.ensurePendingDoc(TEST_GAME_KEY, TEST_DRAW_PERIOD_1, "2999-01-01", ConflictPolicy.HumanOnly);

    const doc = await repo.findByGameKeyAndPeriod(TEST_GAME_KEY, TEST_DRAW_PERIOD_1);
    expect(doc).not.toBeNull();
    expect(doc!.state).toBe(ConsensusState.Pending);
    expect(doc!.appliedPolicy).toBe(ConflictPolicy.HumanOnly);
    expect(doc!.version).toBe(0);
  });

  it("gọi lại lần 2 SAU KHI đã applyMachineDecision → KHÔNG reset state/version về pending/0", async () => {
    await repo.ensurePendingDoc(TEST_GAME_KEY, TEST_DRAW_PERIOD_1, "2999-01-01", ConflictPolicy.HumanOnly);
    const created = await repo.findByGameKeyAndPeriod(TEST_GAME_KEY, TEST_DRAW_PERIOD_1);

    await repo.applyMachineDecision(created!.id, 0, {
      state: ConsensusState.Agreed,
      numbers: ["01", "02", "03"],
      payoutHash: "hash-agreed",
      displayHash: "hash-agreed-display",
      agreeing: [agreement],
      conflicting: [],
      appliedPolicy: ConflictPolicy.HumanOnly,
      publishedAt: new Date(),
    });

    // ensurePendingDoc gọi lại — filter khớp doc đã tồn tại ⇒ $setOnInsert không chạy.
    await repo.ensurePendingDoc(TEST_GAME_KEY, TEST_DRAW_PERIOD_1, "2999-01-01", ConflictPolicy.HumanOnly);

    const after = await repo.findByGameKeyAndPeriod(TEST_GAME_KEY, TEST_DRAW_PERIOD_1);
    expect(after!.state).toBe(ConsensusState.Agreed); // KHÔNG bị reset về pending.
    expect(after!.version).toBe(1);
  });
});

describe("ConsensusRepository.applyMachineDecision — optimistic lock theo version", () => {
  it("expectedVersion khớp → áp thành công, version tăng 1", async () => {
    await repo.ensurePendingDoc(TEST_GAME_KEY, TEST_DRAW_PERIOD_2, "2999-01-02", ConflictPolicy.HumanOnly);
    const doc = await repo.findByGameKeyAndPeriod(TEST_GAME_KEY, TEST_DRAW_PERIOD_2);

    const applied = await repo.applyMachineDecision(doc!.id, 0, {
      state: ConsensusState.Agreed,
      numbers: ["07", "08"],
      payoutHash: "hash-x",
      displayHash: "hash-x-display",
      agreeing: [agreement],
      conflicting: [],
      appliedPolicy: ConflictPolicy.HumanOnly,
      publishedAt: null,
    });

    expect(applied).toBe(true);
    const after = await repo.findByGameKeyAndPeriod(TEST_GAME_KEY, TEST_DRAW_PERIOD_2);
    expect(after!.state).toBe(ConsensusState.Agreed);
    expect(after!.decidedBy).toBe(DecidedBy.Machine);
    expect(after!.version).toBe(1);
  });

  it("expectedVersion LỆCH (đã bị tick khác ghi trước) → false, doc KHÔNG đổi", async () => {
    await repo.ensurePendingDoc(TEST_GAME_KEY, TEST_DRAW_PERIOD_2, "2999-01-02", ConflictPolicy.HumanOnly);
    const doc = await repo.findByGameKeyAndPeriod(TEST_GAME_KEY, TEST_DRAW_PERIOD_2);

    // version thật là 0, cố tình truyền version SAI (5).
    const applied = await repo.applyMachineDecision(doc!.id, 5, {
      state: ConsensusState.Conflict,
      numbers: null,
      payoutHash: null,
      displayHash: null,
      agreeing: [],
      conflicting: [agreement],
      appliedPolicy: ConflictPolicy.HumanOnly,
      publishedAt: null,
    });

    expect(applied).toBe(false);
    const after = await repo.findByGameKeyAndPeriod(TEST_GAME_KEY, TEST_DRAW_PERIOD_2);
    expect(after!.state).toBe(ConsensusState.Pending); // Không bị tick sai ghi đè.
    expect(after!.version).toBe(0);
  });

  it("state đã human_verified → applyMachineDecision LUÔN false, dù version khớp (D6)", async () => {
    await repo.ensurePendingDoc(TEST_GAME_KEY, TEST_DRAW_PERIOD_3, "2999-01-03", ConflictPolicy.HumanOnly);
    const doc = await repo.findByGameKeyAndPeriod(TEST_GAME_KEY, TEST_DRAW_PERIOD_3);

    await repo.setHumanVerified(doc!.id, {
      numbers: ["09", "10"],
      payoutHash: "hash-human",
      displayHash: "hash-human-display",
      humanVerify: {
        accountId: "acc-1",
        username: "op1",
        verifiedAt: new Date(),
        note: "Nguồn authoritative lỗi tạm thời, xác nhận tay theo ảnh chụp trực tiếp",
        chosenObservationId: null,
      },
    });

    const afterHuman = await repo.findByGameKeyAndPeriod(TEST_GAME_KEY, TEST_DRAW_PERIOD_3);
    expect(afterHuman!.version).toBe(1); // setHumanVerified cũng $inc version.

    // Máy cố ghi lại với version KHỚP (1) — vẫn phải bị chặn vì state = human_verified.
    const applied = await repo.applyMachineDecision(afterHuman!.id, 1, {
      state: ConsensusState.Agreed,
      numbers: ["99", "98"],
      payoutHash: "hash-machine-override-attempt",
      displayHash: "hash-machine-override-attempt-display",
      agreeing: [agreement],
      conflicting: [],
      appliedPolicy: ConflictPolicy.HumanOnly,
      publishedAt: new Date(),
    });

    expect(applied).toBe(false);
    const final = await repo.findByGameKeyAndPeriod(TEST_GAME_KEY, TEST_DRAW_PERIOD_3);
    expect(final!.state).toBe(ConsensusState.HumanVerified);
    expect(final!.numbers).toEqual(["09", "10"]); // KHÔNG bị máy ghi đè.
  });
});

describe("ConsensusRepository.setRejected", () => {
  it("đặt state=rejected, numbers/hash về null, publishedAt null", async () => {
    await repo.ensurePendingDoc(TEST_GAME_KEY, TEST_DRAW_PERIOD_1, "2999-01-01", ConflictPolicy.HumanOnly);
    const doc = await repo.findByGameKeyAndPeriod(TEST_GAME_KEY, TEST_DRAW_PERIOD_1);

    const applied = await repo.setRejected(doc!.id, {
      accountId: "acc-2",
      username: "op2",
      verifiedAt: new Date(),
      note: "Nguồn báo huỷ kỳ quay do lỗi kỹ thuật",
      chosenObservationId: null,
    });

    expect(applied).toBe(true);
    const after = await repo.findByGameKeyAndPeriod(TEST_GAME_KEY, TEST_DRAW_PERIOD_1);
    expect(after!.state).toBe(ConsensusState.Rejected);
    expect(after!.numbers).toBeNull();
    expect(after!.publishedAt).toBeNull();
    expect(after!.decidedBy).toBe(DecidedBy.Human);
  });
});

describe("ConsensusRepository.findConflictQueue + findPublished", () => {
  it("findConflictQueue chỉ trả doc state=conflict", async () => {
    await repo.ensurePendingDoc(TEST_GAME_KEY, TEST_DRAW_PERIOD_2, "2999-01-02", ConflictPolicy.HumanOnly);
    const doc = await repo.findByGameKeyAndPeriod(TEST_GAME_KEY, TEST_DRAW_PERIOD_2);

    await repo.applyMachineDecision(doc!.id, 0, {
      state: ConsensusState.Conflict,
      numbers: null,
      payoutHash: null,
      displayHash: null,
      agreeing: [],
      conflicting: [agreement],
      appliedPolicy: ConflictPolicy.HumanOnly,
      publishedAt: null,
    });

    const queue = await repo.findConflictQueue(TEST_GAME_KEY, 100);
    const periods = queue.map((d) => d.drawPeriod);
    expect(periods).toContain(TEST_DRAW_PERIOD_2);

    for (const item of queue) {
      expect(item.state).toBe(ConsensusState.Conflict);
    }
  });

  it("findPublished chỉ trả doc có publishedAt (đã publish)", async () => {
    await repo.ensurePendingDoc(TEST_GAME_KEY, TEST_DRAW_PERIOD_3, "2999-01-03", ConflictPolicy.HumanOnly);
    const doc = await repo.findByGameKeyAndPeriod(TEST_GAME_KEY, TEST_DRAW_PERIOD_3);

    await repo.applyMachineDecision(doc!.id, 0, {
      state: ConsensusState.Agreed,
      numbers: ["11", "12"],
      payoutHash: "hash-pub",
      displayHash: "hash-pub-display",
      agreeing: [agreement],
      conflicting: [],
      appliedPolicy: ConflictPolicy.HumanOnly,
      publishedAt: new Date(),
    });

    const published = await repo.findPublished(TEST_GAME_KEY, 100);
    const periods = published.map((d) => d.drawPeriod);
    expect(periods).toContain(TEST_DRAW_PERIOD_3);

    for (const item of published) {
      expect(item.publishedAt).not.toBeNull();
    }
  });
});
