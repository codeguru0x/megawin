/**
 * ResultFeed – Unit test: decideConsensus (rule layer, pure)
 *
 * PURE — không DB. Bảng input/output theo `03-consensus.plan.md §3-4` (đã cập nhật 2026-09 —
 * xem JSDoc `authoritativeUsable` ở `consensus-decision.ts`):
 * 1. Không có candidate → Pending.
 * 2. Không nhóm nào có Authoritative → Pending (dù Confirming khớp nhau).
 * 3. Authoritative NotAvailable, KHÔNG có nhóm khác lệch (đứng một mình) → Agreed.
 * 4. Đúng 1 nguồn Authoritative duy nhất, Passed → Agreed (case hiện tại của resultfeed).
 * 5. Có nhóm khác lệch + policy HumanOnly (mặc định) → Conflict.
 * 6. Có nhóm khác lệch + policy AuthoritativeWins, trong ngưỡng maxDissentingConfirming → Agreed.
 * 7. Có nhóm khác lệch + policy AuthoritativeWins, vượt ngưỡng → Conflict.
 * 8. WeightedQuorum chưa implement → throw.
 * 9. Authoritative NotAvailable + CÓ nhóm khác lệch → Pending (không đủ tự tin phân xử).
 */

import { describe, expect, it } from "vitest";

import type { ObservationEntity, SourceEntity } from "../../src/entities";
import {
  ConflictPolicy,
  ConsensusState,
  IntrinsicState,
  ResultFeedGameKey,
  ResultFeedProviderId,
  ResultFeedSourceId,
  SourceRole,
} from "../../src/entities/enums";
import type { ConsensusCandidate } from "../../src/rules/consensus-decision";
import { decideConsensus } from "../../src/rules/consensus-decision";

function makeSource(overrides: Partial<SourceEntity> = {}): SourceEntity {
  return {
    id: "source-1",
    sourceId: ResultFeedSourceId.VietlottDetail,
    name: "Vietlott Detail",
    baseUrl: "https://www.vietlott.vn",
    role: SourceRole.Authoritative,
    trustWeight: 100,
    gameKeys: [ResultFeedGameKey.Keno],
    isEnabled: true,
    providerId: ResultFeedProviderId.OxylabsUnblocker,
    parserVersion: "v1",
    requiresRender: false,
    minIntervalMs: 30_000,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

function makeObservation(overrides: Partial<ObservationEntity> = {}): ObservationEntity {
  return {
    id: "obs-1",
    sourceId: ResultFeedSourceId.VietlottDetail,
    gameKey: ResultFeedGameKey.Keno,
    drawPeriod: "0294129",
    drawDateSource: "2026-08-30",
    drawTimeSource: null,
    numbersDisplay: ["01", "02", "03"],
    numbersCanonical: ["01", "02", "03"],
    displayHash: "display-hash-1",
    payoutHash: "payout-hash-1",
    claimedChecksums: {},
    intrinsicState: IntrinsicState.Passed,
    intrinsicMismatch: null,
    parserVersion: "v1",
    submissionId: "sub-1",
    createdAt: new Date("2026-08-30T00:00:00Z"),
    ...overrides,
  };
}

function candidate(observation: Partial<ObservationEntity>, source: Partial<SourceEntity>): ConsensusCandidate {
  return { observation: makeObservation(observation), source: makeSource(source) };
}

describe("decideConsensus", () => {
  it("Đúng logic — không có candidate nào → Pending", () => {
    const result = decideConsensus([], ConflictPolicy.HumanOnly);
    expect(result.state).toBe(ConsensusState.Pending);
    expect(result.numbers).toBeNull();
  });

  it("Logic ngược — chỉ có nguồn Confirming khớp nhau, KHÔNG có Authoritative → Pending", () => {
    const candidates = [
      candidate(
        { id: "obs-a", sourceId: ResultFeedSourceId.VietlottDetail, payoutHash: "hash-x" },
        { id: "src-a", role: SourceRole.Confirming },
      ),
    ];
    const result = decideConsensus(candidates, ConflictPolicy.HumanOnly);
    expect(result.state).toBe(ConsensusState.Pending);
    expect(result.numbers).toBeNull();
    expect(result.conflicting).toHaveLength(1);
  });

  it("Đúng logic — Authoritative NotAvailable (Failed đã bị lọc trước), ĐỨNG MỘT MÌNH → Agreed (2026-09: đồng bộ tiêu chuẩn với script import lịch sử, xem authoritativeUsable)", () => {
    const candidates = [candidate({ intrinsicState: IntrinsicState.NotAvailable }, {})];
    const result = decideConsensus(candidates, ConflictPolicy.HumanOnly);
    expect(result.state).toBe(ConsensusState.Agreed);
    expect(result.numbers).toEqual(["01", "02", "03"]);
  });

  it("Logic ngược — Authoritative NotAvailable + CÓ nhóm khác lệch → Pending (không đủ tự tin phân xử tranh chấp, khác nhánh đứng một mình)", () => {
    const candidates = [
      candidate(
        { id: "obs-auth", intrinsicState: IntrinsicState.NotAvailable },
        { id: "src-auth", role: SourceRole.Authoritative },
      ),
      candidate(
        { id: "obs-confirm", sourceId: "minhchinh" as ResultFeedSourceId, payoutHash: "payout-hash-DIFFERENT" },
        { id: "src-confirm", role: SourceRole.Confirming },
      ),
    ];
    const result = decideConsensus(candidates, ConflictPolicy.HumanOnly);
    expect(result.state).toBe(ConsensusState.Pending);
    expect(result.numbers).toBeNull();
    expect(result.conflicting).toHaveLength(1);
  });

  it("Đúng logic — ĐÚNG 1 nguồn Authoritative duy nhất, Passed → Agreed (case hiện tại resultfeed chỉ có vietlott-detail)", () => {
    const candidates = [candidate({}, {})];
    const result = decideConsensus(candidates, ConflictPolicy.HumanOnly);
    expect(result.state).toBe(ConsensusState.Agreed);
    expect(result.numbers).toEqual(["01", "02", "03"]);
    expect(result.payoutHash).toBe("payout-hash-1");
    expect(result.agreeing).toHaveLength(1);
    expect(result.conflicting).toHaveLength(0);
  });

  it("Đúng logic — nhiều nguồn CÙNG payoutHash với Authoritative (không lệch) → Agreed, agreeing gồm cả Confirming", () => {
    const candidates = [
      candidate({ id: "obs-auth" }, { id: "src-auth", role: SourceRole.Authoritative }),
      candidate(
        { id: "obs-confirm", sourceId: "minhchinh" as ResultFeedSourceId, payoutHash: "payout-hash-1" },
        { id: "src-confirm", role: SourceRole.Confirming },
      ),
    ];
    const result = decideConsensus(candidates, ConflictPolicy.HumanOnly);
    expect(result.state).toBe(ConsensusState.Agreed);
    expect(result.agreeing).toHaveLength(2);
    expect(result.conflicting).toHaveLength(0);
  });

  it("Logic ngược — có nhóm khác lệch + policy HumanOnly (mặc định) → luôn Conflict", () => {
    const candidates = [
      candidate({ id: "obs-auth" }, { id: "src-auth", role: SourceRole.Authoritative }),
      candidate(
        { id: "obs-confirm", sourceId: "minhchinh" as ResultFeedSourceId, payoutHash: "payout-hash-DIFFERENT" },
        { id: "src-confirm", role: SourceRole.Confirming },
      ),
    ];
    const result = decideConsensus(candidates, ConflictPolicy.HumanOnly);
    expect(result.state).toBe(ConsensusState.Conflict);
    expect(result.numbers).toBeNull();
    expect(result.conflicting).toHaveLength(1);
  });

  it("Đúng logic — AuthoritativeWins, số Confirming phản đối TRONG ngưỡng maxDissentingConfirming → Agreed", () => {
    const candidates = [
      candidate({ id: "obs-auth" }, { id: "src-auth", role: SourceRole.Authoritative }),
      candidate(
        { id: "obs-confirm", sourceId: "minhchinh" as ResultFeedSourceId, payoutHash: "payout-hash-DIFFERENT" },
        { id: "src-confirm", role: SourceRole.Confirming },
      ),
    ];
    const result = decideConsensus(candidates, ConflictPolicy.AuthoritativeWins, { maxDissentingConfirming: 1 });
    expect(result.state).toBe(ConsensusState.Agreed);
    expect(result.numbers).toEqual(["01", "02", "03"]);
  });

  it("Logic ngược — AuthoritativeWins, số Confirming phản đối VƯỢT ngưỡng → Conflict", () => {
    const candidates = [
      candidate({ id: "obs-auth" }, { id: "src-auth", role: SourceRole.Authoritative }),
      candidate(
        { id: "obs-c1", sourceId: "minhchinh" as ResultFeedSourceId, payoutHash: "payout-hash-DIFF-1" },
        { id: "src-c1", role: SourceRole.Confirming },
      ),
      candidate(
        { id: "obs-c2", sourceId: "xoso-online" as ResultFeedSourceId, payoutHash: "payout-hash-DIFF-2" },
        { id: "src-c2", role: SourceRole.Confirming },
      ),
    ];
    const result = decideConsensus(candidates, ConflictPolicy.AuthoritativeWins, { maxDissentingConfirming: 1 });
    expect(result.state).toBe(ConsensusState.Conflict);
  });

  it("Đúng logic — AuthoritativeWins không set maxDissentingConfirming → mặc định 0 (bất kỳ lệch nào cũng Conflict)", () => {
    const candidates = [
      candidate({ id: "obs-auth" }, { id: "src-auth", role: SourceRole.Authoritative }),
      candidate(
        { id: "obs-confirm", sourceId: "minhchinh" as ResultFeedSourceId, payoutHash: "payout-hash-DIFFERENT" },
        { id: "src-confirm", role: SourceRole.Confirming },
      ),
    ];
    const result = decideConsensus(candidates, ConflictPolicy.AuthoritativeWins);
    expect(result.state).toBe(ConsensusState.Conflict);
  });

  it("Logic ngược — WeightedQuorum chưa implement → throw rõ ràng (chỉ throw khi CÓ nhóm lệch cần policy phân xử)", () => {
    const candidates = [
      candidate({ id: "obs-auth" }, { id: "src-auth", role: SourceRole.Authoritative }),
      candidate(
        { id: "obs-confirm", sourceId: "minhchinh" as ResultFeedSourceId, payoutHash: "payout-hash-DIFFERENT" },
        { id: "src-confirm", role: SourceRole.Confirming },
      ),
    ];
    expect(() => decideConsensus(candidates, ConflictPolicy.WeightedQuorum)).toThrow(/WeightedQuorum/);
  });

  it("Đúng logic — WeightedQuorum với ĐÚNG 1 nguồn (không có gì để phân xử) → Agreed, KHÔNG throw", () => {
    const candidates = [candidate({}, {})];
    const result = decideConsensus(candidates, ConflictPolicy.WeightedQuorum);
    expect(result.state).toBe(ConsensusState.Agreed);
  });

  it("Đúng logic — numbers công bố LUÔN lấy từ observation của Authoritative, không phải Confirming dù cùng nhóm", () => {
    const candidates = [
      candidate(
        { id: "obs-auth", numbersDisplay: ["05", "06", "07"], payoutHash: "shared-hash" },
        { id: "src-auth", role: SourceRole.Authoritative },
      ),
      candidate(
        {
          id: "obs-confirm",
          sourceId: "minhchinh" as ResultFeedSourceId,
          numbersDisplay: ["07", "06", "05"],
          payoutHash: "shared-hash",
        },
        { id: "src-confirm", role: SourceRole.Confirming },
      ),
    ];
    const result = decideConsensus(candidates, ConflictPolicy.HumanOnly);
    expect(result.state).toBe(ConsensusState.Agreed);
    expect(result.numbers).toEqual(["05", "06", "07"]);
  });
});
