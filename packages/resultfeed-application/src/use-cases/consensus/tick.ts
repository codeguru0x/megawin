/**
 * ResultFeed – ConsensusTickUseCase (orchestration)
 *
 * `03-consensus.plan.md §3`. Đọc observation MỚI ĐỔI (cursor theo `updatedAt`, cùng idiom với
 * `EvaluateOpsAlertsUseCase` của Keno), suy ra tập `(gameKey, drawPeriod)` cần tính lại, rồi
 * áp thuật toán {@link decideConsensus} (pure, `@megawin/resultfeed/rules`) cho từng kỳ.
 *
 * 1 instance xử lý TẤT CẢ game (Keno, Bingo18, …) — KHÔNG tách theo game như
 * `FetchAndParseUseCase` (1 instance/nguồn×game): observation của game nào cũng đi qua CÙNG
 * một thuật toán quyết định, tách theo game chỉ nhân bản lock/cursor mà không thêm giá trị.
 *
 * ## Vì sao cursor là `updatedAt`, không phải `createdAt`
 *
 * `upsertObservation` ghi `updatedAt = now` MỖI LẦN chạy (kể cả re-parse cùng `parserVersion`
 * không đổi nội dung) — bắt được cả trường hợp 1 nguồn tự sửa lại observation cũ (hiếm,
 * nhưng nếu chỉ cursor theo `createdAt` sẽ bỏ sót vĩnh viễn vì `createdAt` không đổi khi
 * update-in-place).
 *
 * ## Vì sao lỗi 1 kỳ KHÔNG chặn cursor tiến (khác `EvaluateOpsAlertsUseCase`)
 *
 * `EvaluateOpsAlertsUseCase` dùng cursor GLOBAL cho 1 loại đánh giá duy nhất trên TOÀN BỘ kỳ
 * kế tiếp của game đó — nhảy qua kỳ lỗi làm mất đánh giá vĩnh viễn cho tới lần update sau.
 * Ở đây khác: mỗi `(gameKey, drawPeriod)` độc lập hoàn toàn (không có state tích luỹ liên kỳ
 * như betting stats) — 1 kỳ lỗi (VD source bị xoá khỏi registry giữa lúc tick) không được
 * phép chặn observation MỚI của MỌI kỳ khác đứng sau nó trong cùng batch. Lỗi được ghi qua
 * `recordStalledItem` (hiện ở trang Workers health) — kỳ đó sẽ tự được thử lại khi có
 * observation mới cho chính kỳ đó (không tự động retry nếu không có gì đổi).
 */

import type { ResultFeedGameKey, SourceEntity } from "@megawin/resultfeed/entities";
import {
  ConsensusState,
  IntrinsicState,
  ResultFeedAlertSeverity,
  ResultFeedAlertType,
} from "@megawin/resultfeed/entities";
import type { ConsensusCandidate } from "@megawin/resultfeed/rules";
import { decideConsensus } from "@megawin/resultfeed/rules";
import { AppException } from "@megawin/shared/errors";
import { logError } from "@megawin/shared/utils";
import type { TickLoopResult, TickOutcome } from "@megawin/worker-core/workers";
import { TickLoopWorker } from "@megawin/worker-core/workers";

import { AlertRepository } from "../../infras/repos/alert-repo";
import { ConsensusRepository } from "../../infras/repos/consensus-repo";
import { ObservationRepository } from "../../infras/repos/observation-repo";
import { SourceRepository } from "../../infras/repos/source-repo";
import { RESULTFEED_DEFAULT_CONFLICT_POLICY } from "./default-policy";

/** Trần observation đọc 1 tick — tick bận đột biến (burst catch-up nhiều kỳ) không hút hết budget. */
const MAX_OBSERVATIONS_PER_TICK = 50;
/** Nhịp cố định giữa 2 tick trong 1 invocation — không cần config động ở G3 (chỉ 1 nguồn). */
const TICK_MS = 5_000;

export interface ConsensusTickDeps {
  /**
   * Testing-only override (`03-consensus.plan.md §6.1`) — set `publishedAt = now` NGAY khi
   * máy quyết `state = Agreed`, KHÔNG cần chờ `HumanVerified`. Đọc từ
   * `RESULTFEED_AUTO_PUBLISH_UNVERIFIED` ở tầng handler/worker (KHÔNG đọc env trực tiếp ở
   * use-case — giữ use-case testable, không phụ thuộc `process.env`).
   */
  autoPublishUnverified: boolean;
}

/** Kết quả 1 lần chạy invocation — thống kê để log/monitor trang Workers health. */
export interface ConsensusTickRunResult extends TickLoopResult {
  /** Số (gameKey, drawPeriod) đã tính lại quyết định qua tất cả tick trong invocation. */
  evaluated: number;
  agreed: number;
  conflicted: number;
  pending: number;
}

export class ConsensusTickUseCase extends TickLoopWorker<void, ConsensusTickRunResult> {
  protected readonly ttlSeconds = 60; // = Lambda timeout consensus-tick trong functions/consensus.yml
  protected override readonly description = "ResultFeed — tổng hợp consensus từ observation mới (mọi game)";

  private readonly deps: ConsensusTickDeps;
  private readonly observationRepo = new ObservationRepository();
  private readonly sourceRepo = new SourceRepository();
  private readonly consensusRepo = new ConsensusRepository();
  private readonly alertRepo = new AlertRepository();

  /** Cache toàn bộ `Source` — refresh 1 lần/invocation ở `beforeLoop` (đủ mới, ít đổi). */
  private sourcesById = new Map<string, SourceEntity>();
  private cursor = new Date(0);
  private counters = { evaluated: 0, agreed: 0, conflicted: 0, pending: 0 };

  constructor(deps: ConsensusTickDeps) {
    super();
    this.deps = deps;
  }

  protected resolveLockKey(): string {
    return "resultfeed:consensus:tick";
  }

  protected override async beforeLoop(): Promise<void> {
    const sources = await this.sourceRepo.listAll();
    this.sourcesById = new Map(sources.map((s) => [s.sourceId, s]));
    this.counters = { evaluated: 0, agreed: 0, conflicted: 0, pending: 0 };

    const lock = await this.lockRepo.findByKey(this.resolveLockKey());
    const parsed = lock?.cursor ? new Date(lock.cursor) : undefined;
    this.cursor = parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date(0);
  }

  protected async resolveTickMs(): Promise<number> {
    return TICK_MS;
  }

  protected buildResult(loop: TickLoopResult): ConsensusTickRunResult {
    return { ticks: loop.ticks, ...this.counters };
  }

  protected async runTick(): Promise<TickOutcome> {
    const changed = await this.observationRepo.findChangedSince(this.cursor, MAX_OBSERVATIONS_PER_TICK);
    if (changed.length === 0) {
      return { shouldStop: true };
    }

    // Dedupe — nhiều observation đổi trong batch có thể cùng 1 (gameKey, drawPeriod), chỉ cần
    // tính lại quyết định 1 LẦN cho mỗi kỳ (đọc lại toàn bộ observation của kỳ đó bên trong).
    const periods = new Map<string, { gameKey: ResultFeedGameKey; drawPeriod: string }>();
    for (const obs of changed) {
      periods.set(`${obs.gameKey}:${obs.drawPeriod}`, { gameKey: obs.gameKey, drawPeriod: obs.drawPeriod });
    }

    for (const { gameKey, drawPeriod } of periods.values()) {
      const itemKey = `${gameKey}:${drawPeriod}`;
      try {
        const state = await this.processPeriod(gameKey, drawPeriod);
        this.counters.evaluated += 1;
        if (state === ConsensusState.Agreed) {
          this.counters.agreed += 1;
        } else if (state === ConsensusState.Conflict) {
          this.counters.conflicted += 1;
        } else {
          this.counters.pending += 1;
        }
        this.clearStalledItem(itemKey);
      } catch (error) {
        // KHÔNG break — xem JSDoc đầu file "vì sao lỗi 1 kỳ không chặn cursor tiến".
        logError("resultfeed:consensus:tick", error, { gameKey, drawPeriod });
        this.recordStalledItem(itemKey, error);
      }
    }

    const last = changed[changed.length - 1];
    if (!last) {
      throw AppException.internal("changed.length > 0 nhưng last undefined — bất biến mảng bị vi phạm.");
    }
    this.cursor = last.updatedAt;
    const ok = await this.setCursor(this.cursor.toISOString());
    if (!ok) {
      return { shouldStop: true }; // lock bị takeover — dừng êm, invocation sau tự tiếp tục.
    }
    return { shouldStop: changed.length < MAX_OBSERVATIONS_PER_TICK };
  }

  /**
   * Tính lại quyết định cho ĐÚNG 1 `(gameKey, drawPeriod)` — đọc lại TOÀN BỘ observation của
   * kỳ đó (không chỉ observation vừa đổi), vì quyết định phụ thuộc TẤT CẢ nguồn, không chỉ
   * nguồn vừa cập nhật.
   *
   * Trả về `state` cuối cùng (kể cả khi bị chặn ở bước 0 — trả state hiện có, không tính gì).
   */
  private async processPeriod(gameKey: ResultFeedGameKey, drawPeriod: string): Promise<ConsensusState> {
    const observations = await this.observationRepo.findByGameKeyAndPeriod(gameKey, drawPeriod);
    if (observations.length === 0) {
      // Lý thuyết không xảy ra (vừa đọc được từ findChangedSince) — giữ để an toàn kiểu.
      return ConsensusState.Pending;
    }

    // `drawDateSource` chỉ dùng làm giá trị KHỞI TẠO cho doc pending lần đầu — lấy từ observation
    // bất kỳ (cùng kỳ, các nguồn thường công bố cùng ngày quay).
    const first = observations[0];
    if (!first) {
      throw AppException.internal("observations.length > 0 nhưng first undefined — bất biến mảng bị vi phạm.");
    }
    await this.consensusRepo.ensurePendingDoc(
      gameKey,
      drawPeriod,
      first.drawDateSource,
      RESULTFEED_DEFAULT_CONFLICT_POLICY,
    );

    const doc = await this.consensusRepo.findByGameKeyAndPeriod(gameKey, drawPeriod);
    if (!doc) {
      throw AppException.internal(
        `Consensus doc biến mất ngay sau ensurePendingDoc (game=${gameKey}, period=${drawPeriod}).`,
      );
    }

    // ── Bước 0 (B1) — chặn TRƯỚC MỌI tính toán, KHÔNG tính lại gì cả ─────────
    if (doc.state === ConsensusState.HumanVerified || doc.state === ConsensusState.Rejected) {
      return doc.state;
    }

    // ── Bước 1 (B4) — loại observation IntrinsicState.Failed trước khi nhóm ─
    const eligible = observations.filter((o) => o.intrinsicState !== IntrinsicState.Failed);

    const candidates: ConsensusCandidate[] = [];
    for (const observation of eligible) {
      const source = this.sourcesById.get(observation.sourceId);
      if (!source) {
        // Registry thiếu source (bị xoá/đổi tên giữa lúc chạy) — bỏ observation này, KHÔNG
        // throw cả period: các nguồn khác của kỳ vẫn nên được xét.
        logError(
          "resultfeed:consensus:tick",
          new Error(`Source '${observation.sourceId}' không có trong registry — bỏ observation khỏi consensus.`),
          { gameKey, drawPeriod, observationId: observation.id },
        );
        continue;
      }
      candidates.push({ observation, source });
    }

    const decision = decideConsensus(candidates, RESULTFEED_DEFAULT_CONFLICT_POLICY);

    // `03-consensus.plan.md §6.1` — cờ testing, CHỈ set publishedAt khi Agreed. Mọi state khác
    // ⇒ null (không có gì để publish; Conflict/Pending không đủ điều kiện dù cờ bật).
    const publishedAt = decision.state === ConsensusState.Agreed && this.deps.autoPublishUnverified ? new Date() : null;

    await this.consensusRepo.applyMachineDecision(doc.id, doc.version, {
      state: decision.state,
      numbers: decision.numbers,
      payoutHash: decision.payoutHash,
      displayHash: decision.displayHash,
      agreeing: decision.agreeing,
      conflicting: decision.conflicting,
      appliedPolicy: RESULTFEED_DEFAULT_CONFLICT_POLICY,
      publishedAt,
    });
    // `applyMachineDecision` có thể trả `false` (version lệch — người vừa verify song song
    // với lúc ta đang tính). Đây là outcome BÌNH THƯỜNG theo optimistic lock (03 §3 bước 6),
    // KHÔNG throw, KHÔNG retry — quyết định người luôn thắng, tick sau tự đọc lại state mới.

    if (decision.state === ConsensusState.Conflict) {
      await this.alertRepo.upsertByDedupeKey({
        type: ResultFeedAlertType.ConsensusConflict,
        severity: ResultFeedAlertSeverity.Critical,
        payload: {
          gameKey,
          drawPeriod,
          conflictingSourceIds: decision.conflicting.map((c) => c.sourceId),
        },
        dedupeKey: `consensus_conflict:${gameKey}:${drawPeriod}`,
      });
    }

    return decision.state;
  }
}
