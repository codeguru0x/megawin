/**
 * ResultFeed – Mapper unit tests (PURE — không DB)
 *
 * Các mapper là 1:1 doc→entity (chỉ đổi `_id` → `id` string). Test này bảo vệ chống
 * regression khi thêm/đổi field entity mà quên cập nhật mapper tương ứng.
 */

import {
  ConflictPolicy,
  ConsensusState,
  DecidedBy,
  IntrinsicState,
  ResultFeedAlertSeverity,
  ResultFeedAlertStatus,
  ResultFeedAlertType,
  ResultFeedGameKey,
  SourceRole,
  SubmissionState,
} from "@megawin/resultfeed/entities";
import { Binary, ObjectId } from "mongodb";
import { describe, expect, it } from "vitest";

import { AlertMapper } from "../../src/infras/mappers/alert-mapper";
import { ConsensusMapper } from "../../src/infras/mappers/consensus-mapper";
import { ObservationMapper } from "../../src/infras/mappers/observation-mapper";
import { SourceCursorMapper } from "../../src/infras/mappers/source-cursor-mapper";
import { SourceMapper } from "../../src/infras/mappers/source-mapper";
import { SubmissionMapper } from "../../src/infras/mappers/submission-mapper";

describe("SourceMapper", () => {
  it("map đầy đủ field, _id → id string", () => {
    const _id = new ObjectId();
    const doc = {
      _id,
      sourceId: "vietlott-detail",
      name: "Vietlott Detail",
      baseUrl: "https://vietlott.vn",
      role: SourceRole.Authoritative,
      trustWeight: 100,
      gameKeys: [ResultFeedGameKey.Keno, ResultFeedGameKey.Bingo18],
      isEnabled: true,
      providerId: "oxylabs",
      parserVersion: "v1",
      requiresRender: false,
      minIntervalMs: 3000,
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-02"),
    };

    const entity = new SourceMapper().mapOne(doc)!;

    expect(entity.id).toBe(_id.toHexString());
    expect(entity.sourceId).toBe("vietlott-detail");
    expect(entity.role).toBe(SourceRole.Authoritative);
    expect(entity.gameKeys).toEqual([ResultFeedGameKey.Keno, ResultFeedGameKey.Bingo18]);
    expect((entity as { _id?: unknown })._id).toBeUndefined();
  });
});

describe("SubmissionMapper", () => {
  it("map đầy đủ field, giữ nguyên Binary bodyGz", () => {
    const _id = new ObjectId();
    const bodyGz = new Binary(Buffer.from("gz-bytes"));
    const doc = {
      _id,
      sourceId: "vietlott-detail",
      gameKey: ResultFeedGameKey.Keno,
      requestUrl: "https://vietlott.vn/keno?draw=1",
      httpStatus: 200,
      contentType: "text/html",
      bodyGz,
      contentHash: "abc123",
      bodyBytes: 5000,
      providerId: "oxylabs",
      elapsedMs: 350,
      state: SubmissionState.Fetched,
      failureReason: null,
      fetchedAt: new Date("2026-01-01"),
    };

    const entity = new SubmissionMapper().mapOne(doc)!;

    expect(entity.id).toBe(_id.toHexString());
    expect(entity.bodyGz).toBe(bodyGz);
    expect(entity.state).toBe(SubmissionState.Fetched);
    expect(entity.failureReason).toBeNull();
  });
});

describe("ObservationMapper", () => {
  it("map đầy đủ field, giữ nguyên thứ tự numbersDisplay", () => {
    const _id = new ObjectId();
    const doc = {
      _id,
      sourceId: "vietlott-detail",
      gameKey: ResultFeedGameKey.Bingo18,
      drawPeriod: "0000123",
      drawDateSource: "2026-01-01",
      drawTimeSource: null,
      numbersDisplay: ["5", "2", "5"],
      numbersCanonical: ["2", "5", "5"],
      displayHash: "display-hash",
      payoutHash: "payout-hash",
      claimedChecksums: { total: 12 },
      intrinsicState: IntrinsicState.Passed,
      intrinsicMismatch: null,
      parserVersion: "v1",
      submissionId: "000000000000000000000001",
      createdAt: new Date("2026-01-01"),
    };

    const entity = new ObservationMapper().mapOne(doc)!;

    expect(entity.id).toBe(_id.toHexString());
    expect(entity.numbersDisplay).toEqual(["5", "2", "5"]); // KHÔNG bị sort — giữ thứ tự nguồn.
    expect(entity.numbersCanonical).toEqual(["2", "5", "5"]);
    expect(entity.intrinsicState).toBe(IntrinsicState.Passed);
  });
});

describe("ConsensusMapper", () => {
  it("map đầy đủ field, kể cả humanVerify null", () => {
    const _id = new ObjectId();
    const doc = {
      _id,
      gameKey: ResultFeedGameKey.Keno,
      drawPeriod: "0000123",
      drawDateSource: "2026-01-01",
      state: ConsensusState.Agreed,
      numbers: ["01", "02"],
      payoutHash: "payout-hash",
      displayHash: "display-hash",
      agreeing: [],
      conflicting: [],
      decidedBy: DecidedBy.Machine,
      decidedAt: new Date("2026-01-01"),
      appliedPolicy: ConflictPolicy.HumanOnly,
      humanVerify: null,
      publishedAt: new Date("2026-01-01"),
      version: 1,
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01"),
    };

    const entity = new ConsensusMapper().mapOne(doc)!;

    expect(entity.id).toBe(_id.toHexString());
    expect(entity.state).toBe(ConsensusState.Agreed);
    expect(entity.humanVerify).toBeNull();
    expect(entity.version).toBe(1);
  });
});

describe("SourceCursorMapper", () => {
  it("map đầy đủ field, kể cả lastConfirmedPeriod null", () => {
    const _id = new ObjectId();
    const doc = {
      _id,
      sourceId: "vietlott-detail",
      gameKey: ResultFeedGameKey.Keno,
      lastConfirmedPeriod: null,
      nextExpectedPeriod: null,
      nextFetchAt: new Date("2026-01-01"),
      consecutiveFailures: 0,
      needsBackfill: false,
      consecutiveIntrinsicFailures: 0,
      isPaused: false,
      updatedAt: new Date("2026-01-01"),
    };

    const entity = new SourceCursorMapper().mapOne(doc)!;

    expect(entity.id).toBe(_id.toHexString());
    expect(entity.lastConfirmedPeriod).toBeNull();
    expect(entity.needsBackfill).toBe(false);
    expect(entity.consecutiveIntrinsicFailures).toBe(0);
    expect(entity.isPaused).toBe(false);
  });
});

describe("AlertMapper", () => {
  it("map đầy đủ field, kể cả ackBy/ackAt null", () => {
    const _id = new ObjectId();
    const doc = {
      _id,
      type: ResultFeedAlertType.PeriodGap,
      severity: ResultFeedAlertSeverity.Critical,
      payload: { gameKey: ResultFeedGameKey.Keno },
      dedupeKey: "dedupe-1",
      status: ResultFeedAlertStatus.New,
      createdAt: new Date("2026-01-01"),
      ackBy: null,
      ackAt: null,
    };

    const entity = new AlertMapper().mapOne(doc)!;

    expect(entity.id).toBe(_id.toHexString());
    expect(entity.type).toBe(ResultFeedAlertType.PeriodGap);
    expect(entity.severity).toBe(ResultFeedAlertSeverity.Critical);
    expect(entity.ackBy).toBeNull();
  });
});
