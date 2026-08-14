/**
 * Max 3D Pro – Sync Betting Stats Worker
 *
 * Cập nhật `max3dpro_draw_betting_stats` (+ pair/pair-account/account stats) async cho mọi kỳ
 * chưa `final` — KHÔNG đụng hot path place-bet (analysis §3.1–3.3). Extends
 * {@link TickLoopWorker}: 1 worker toàn hệ (`max3dpro:stats-sync`), vòng lặp/budget/cadence
 * nằm ở base class (packages/worker-core) — xem JSDoc `TickLoopWorker` cho cơ chế loop.
 *
 * ## Hàng đợi việc: trạng thái công việc, không phải status draw
 *
 * Nguồn điều phối là `final: false` trên chính stats doc — KHÔNG suy ra từ status draw
 * (`SalesOpen`/`SalesClosed`/…). Nhờ vậy bền với mọi tốc độ chuyển status: kỳ có thể lướt
 * qua nhiều status giữa 2 tick mà vẫn không bị bỏ sót, vì nó luôn còn trong hàng đợi cho
 * đến khi được đóng dấu `final` (chỉ khi terminal `Settled`/`Void` + đã hút cạn entries).
 *
 * ## Mỗi invocation
 *
 * 1. `beforeLoop`: đọc GlobalConfig 1 lần, reset counters, rồi **enroll** — `ensureDocs`
 *    cho mọi kỳ chưa hoàn thành → kỳ mới vào được hàng đợi `final:false`. Enroll chạy 1
 *    lần/invocation (không phải mỗi tick): Max 3D Pro quay 3 kỳ/tuần, kỳ tạo GIỮA invocation
 *    chờ tối đa ~55s để vào hàng đợi — vô nghĩa so với chu kỳ nhiều ngày. Entries của kỳ mới
 *    nằm yên trong `max3dpro_ticket_entries` (insert-only) chờ invocation sau enroll rồi
 *    drain, KHÔNG mất.
 * 2. Mỗi tick: `findNotFinal()` → hàng đợi việc (có trần, sort `drawId` asc để kỳ cũ nhất
 *    ưu tiên). Mỗi kỳ: đọc entries `_id > watermark RIÊNG của kỳ` theo batch → ghi 4
 *    collection bằng `$inc` idempotent. Query loại `status: Void` NGAY TẠI NGUỒN (repo) nên
 *    không cần bước trừ bù.
 * 3. Kỳ ở trạng thái **TERMINAL** (`Settled`/`Void`) và đã hút hết entries → `stampFinal`.
 *
 * Đánh giá alert NGHIỆP VỤ KHÔNG còn nằm ở worker này — xem `EvaluateOpsAlertsUseCase`
 * (worker `max3dpro:ops-alerts`, tách theo analysis §5.1: lỗi rule alert không làm chậm sync,
 * backlog sync không làm trễ alert kỳ khác). Sức khoẻ vận hành của CHÍNH worker này (kỳ lỗi
 * lặp lại) do `worker-core` theo dõi qua `stalledItems` trên lock doc — xem
 * `SingleRunWorker.recordStalledItem`/`clearStalledItem`.
 */

import { DRAW_COMPLETED_STATUSES, type DrawStatus } from "@megawin/game-core/entities";
import type { GlobalConfigEntity, OpsConfig, OpsStatsConfig } from "@megawin/game-max3dpro/entities";
import { DEFAULT_MAX3D_PRO_CONFIG } from "@megawin/game-max3dpro/rules";
import { logError } from "@megawin/shared/utils";
import type { TickLoopResult, TickOutcome } from "@megawin/worker-core/workers";
import { LockTakenOverError, TickLoopWorker } from "@megawin/worker-core/workers";

import { AccountStatsRepository } from "../../infras/repos/account-stats-repo";
import { BettingStatsRepository } from "../../infras/repos/betting-stats-repo";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { PairAccountsRepository } from "../../infras/repos/pair-accounts-repo";
import { PairStatsRepository } from "../../infras/repos/pair-stats-repo";
import { GetGlobalConfigUseCase } from "../game-config/get-global-config";
import { Max3dproDrawStatsAccumulator, type PrizeContext } from "./stats-accumulator";

/** Kết quả 1 lần chạy worker (thống kê để log/monitor). */
export interface SyncBettingStatsResult {
  /** Số tick đã chạy trong invocation. */
  ticks: number;
  /** Tổng entries mới đã cộng qua tất cả tick. */
  entriesApplied: number;
  /** Số kỳ đã đóng dấu `final` trong invocation. */
  finalized: number;
  /** Số kỳ bị lỗi và đã bỏ qua (không làm chết cả tick). */
  failed: number;
}

/** Batch đọc entries mỗi lần query. */
const READ_BATCH = 1_000;

/**
 * Trần entries xử lý cho 1 KỲ trong 1 tick.
 *
 * Không có trần thì kỳ tồn đọng lớn (worker chết vài giờ rồi bật lại) sẽ hút hết budget
 * invocation và **bỏ đói các kỳ khác** — kể cả kỳ đang mở bán. Vượt trần thì phần còn lại
 * để tick sau: watermark đã tiến nên tick sau tiếp tục liền mạch, không đọc lại.
 */
const MAX_ENTRIES_PER_DRAW_PER_TICK = 20_000;

/**
 * Trần số kỳ xử lý trong 1 tick.
 *
 * `findNotFinal` sort `drawId` asc nên kỳ cũ nhất (sắp settle, cần số chính xác nhất) luôn
 * được ưu tiên; kỳ mới hơn chờ tick sau. Cũng chặn việc `findMany` cắt ngầm ở 500 doc.
 */
const MAX_DRAWS_PER_TICK = 200;

/** Trạng thái TERMINAL: kỳ không bao giờ nhận cược mới nữa ⇒ được đóng dấu `final`. */
const TERMINAL_STATUSES = new Set<DrawStatus>(DRAW_COMPLETED_STATUSES);

export class SyncBettingStatsUseCase extends TickLoopWorker<void, SyncBettingStatsResult> {
  protected readonly ttlSeconds = 120; // = Lambda timeout stats.yml
  protected override readonly description =
    "Max 3D Pro — đồng bộ thống kê cược theo delta (tick ~30s, mọi kỳ chưa final)";

  private readonly getGlobalConfig = new GetGlobalConfigUseCase();
  private readonly drawRepo = new DrawRepository();
  private readonly entryRepo = new EntryRepository();
  private readonly statsRepo = new BettingStatsRepository();
  private readonly pairStatsRepo = new PairStatsRepository();
  private readonly pairAccountsRepo = new PairAccountsRepository();
  private readonly accountStatsRepo = new AccountStatsRepository();

  // Field instance — Lambda single-threaded, mỗi invocation 1 instance state riêng
  // (cùng giả định với SingleRunWorker._lockKey). PHẢI reset trong beforeLoop
  // vì Lambda container reuse giữ instance sống qua nhiều invocation.
  private prize!: PrizeContext;
  private statsConfig!: OpsStatsConfig;
  private counters = { entriesApplied: 0, finalized: 0, failed: 0 };

  protected resolveLockKey(): string {
    return "max3dpro:stats-sync";
  }

  protected override async beforeLoop(): Promise<void> {
    const config = await this.getGlobalConfig.run();
    // Doc cũ (trước khi thêm section ops) chưa có field → fallback default để worker không
    // crash trước lần staff save config đầu tiên (plan p0-03 §3).
    const ops: OpsConfig = config.ops ?? DEFAULT_MAX3D_PRO_CONFIG.ops;
    this.prize = this.buildPrizeContext(config, ops);
    this.statsConfig = ops.stats;
    this.counters = { entriesApplied: 0, finalized: 0, failed: 0 }; // reset — container reuse

    // Enroll 1 lần/invocation: kỳ tạo GIỮA invocation chờ tối đa ~55s để vào hàng đợi — vô
    // nghĩa so với chu kỳ nhiều ngày. Nhờ vậy `runTick` còn đúng 1 câu chuyện: lấy hàng đợi
    // → hút delta → đóng dấu.
    const unfinishedIds = await this.drawRepo.listUnfinishedDrawIds();
    await this.statsRepo.ensureDocs(unfinishedIds);
  }

  protected async resolveTickMs(): Promise<number> {
    return this.statsConfig.tickSeconds * 1000; // beforeLoop chạy trước — đã có config
  }

  protected buildResult(loop: TickLoopResult): SyncBettingStatsResult {
    return { ticks: loop.ticks, ...this.counters };
  }

  /** 1 tick: hút delta cho mọi kỳ chưa `final` → đóng dấu kỳ terminal (enroll đã chạy ở `beforeLoop`). */
  protected async runTick(): Promise<TickOutcome> {
    // ── Bước 1: hàng đợi việc theo TRẠNG THÁI CÔNG VIỆC, không theo status draw ──
    const cursors = await this.statsRepo.findNotFinal(MAX_DRAWS_PER_TICK);
    if (cursors.length === 0) {
      return {};
    }

    // Status kỳ để biết khi nào được đóng dấu `final` (chỉ Settled/Void). Kỳ trong hàng đợi
    // có thể đã terminal từ lâu (worker chết rồi bật lại) nên KHÔNG suy ra từ bước 1.
    const statusByDraw = await this.drawRepo.getStatusesByDrawIds(cursors.map((c) => c.drawId));

    for (const drawCursor of cursors) {
      // 1 kỳ lỗi (data bẩn, doc quá cỡ…) KHÔNG được làm chết cả tick — các kỳ còn lại,
      // nhất là kỳ đang mở bán, vẫn phải được cập nhật.
      try {
        const applied = await this.syncDraw(drawCursor.drawId, drawCursor.lastEntryId, this.prize, this.statsConfig);
        this.counters.entriesApplied += applied.entriesApplied;
        this.clearStalledItem(drawCursor.drawId); // kỳ qua được → xoá streak

        // Đóng dấu `final` CHỈ khi kỳ terminal VÀ đã hút hết entries. `SalesClosed` KHÔNG
        // phải terminal: kỳ có thể mở bán lại, đóng dấu sớm sẽ mất cược sau đó.
        const status = statusByDraw.get(drawCursor.drawId);
        if (status !== undefined && TERMINAL_STATUSES.has(status) && applied.drained) {
          await this.statsRepo.stampFinal(drawCursor.drawId);
          this.counters.finalized += 1;
        }
      } catch (error) {
        // Mất lock KHÔNG phải "kỳ lỗi": phải thoát cả invocation, không chạy kỳ tiếp theo.
        if (error instanceof LockTakenOverError) {
          throw error;
        }
        this.counters.failed += 1;
        logError(this.resolveLockKey(), error, { drawId: drawCursor.drawId });
        // Streak lỗi per-kỳ do worker-core giữ (persist trên lock doc, tích luỹ qua invocation).
        this.recordStalledItem(drawCursor.drawId, error);
      }
    }

    return {};
  }

  /**
   * Hút entries mới của 1 kỳ theo watermark rồi ghi delta — mỗi batch là 1 đơn vị bền vững.
   *
   * Ghi theo TỪNG BATCH (không gom cả tick vào RAM) vì: (1) RAM bị chặn ở `READ_BATCH`
   * entries thay vì toàn bộ tồn đọng — quan trọng với Max 3D Pro nặng RAM nhất (10⁶ ordered
   * pairs); (2) crash giữa tick chỉ mất tối đa 1 batch, batch trước đã bền; (3) watermark
   * tiến dần nên không bao giờ đọc lại phần đã cộng.
   *
   * Thứ tự ghi có Ý NGHĨA: 3 collection phụ trước, `max3dpro_draw_betting_stats` (chứa
   * watermark ĐỌC) SAU CÙNG. Crash giữa các lệnh ⇒ tick sau đọc lại đúng batch đó; các
   * collection đã ghi thấy `lastEntryId` đã ≥ batch nên no-op, collection chưa ghi thì được
   * áp — hệ tự hội tụ, KHÔNG cần transaction cross-collection (mongodb.mdc §8.6).
   *
   * ## 1 khái niệm watermark — 3 tên PHÂN VAI theo giai đoạn (KHÔNG dùng lẫn)
   *
   * - `lastEntryId` (param + field DB, khớp `DrawStatsCursor.lastEntryId`): watermark
   *   ĐỌC VÀO — vị trí đã cộng tới lúc BẮT ĐẦU gọi hàm này. `undefined` = kỳ mới → đọc từ đầu.
   * - `cursor` (local, mutable): watermark trong lúc vòng đọc ĐANG CHẠY — tiến dần sau mỗi
   *   batch, dùng làm filter `_id >` cho lần đọc kế tiếp.
   * - `batchMaxId`: watermark MỚI vừa tính xong từ batch hiện tại — dùng để tiến `cursor` VÀ
   *   để ghi xuống DB (tham số cùng tên ở {@link writeBatch}).
   *
   * @param drawId - Kỳ cần đồng bộ.
   * @param lastEntryId - Watermark bắt đầu đọc, lấy từ `DrawStatsCursor.lastEntryId`.
   * @param prize - Prize context cho accumulator (unitPrice fallback + potentialWin proxy).
   * @param stats - `ops.stats` — truyền xuống {@link writeBatch} cho `$slice topPotential`.
   * @returns Số entries đã cộng và `drained` = đã hút cạn entries của kỳ trong tick này.
   */
  private async syncDraw(
    drawId: string,
    lastEntryId: string | undefined,
    prize: PrizeContext,
    stats: OpsStatsConfig,
  ): Promise<{ entriesApplied: number; drained: boolean }> {
    let cursor = lastEntryId;
    let entriesApplied = 0;

    while (true) {
      const entries = await this.entryRepo.getEntriesForStatsAfter(drawId, cursor, READ_BATCH);
      if (entries.length === 0) {
        return { entriesApplied, drained: true };
      }

      const acc = new Max3dproDrawStatsAccumulator(drawId, prize);
      for (const entry of entries) {
        acc.addEntry(entry);
      }

      // batchMaxId = watermark mới của batch này (xem giải thích 3 tên ở JSDoc method).
      const batchMaxId = entries[entries.length - 1]!.id;
      await this.writeBatch(drawId, acc, batchMaxId, stats);

      entriesApplied += entries.length;
      cursor = batchMaxId; // tiến watermark cho vòng đọc kế tiếp

      // Gia hạn lock TRONG vòng đọc: kỳ tồn đọng lớn có thể vượt TTL ngay giữa 1 tick → lock
      // hết hạn, worker khác takeover và 2 writer cùng ghi. Heartbeat ở đây thay vì chỉ sau tick.
      const ok = await this.extendLock();
      if (!ok) {
        throw new LockTakenOverError("max3dpro:stats-sync");
      }

      // Hết entries trong batch cuối → đã hút cạn.
      if (entries.length < READ_BATCH) {
        return { entriesApplied, drained: true };
      }

      // Chạm trần → nhường lượt cho các kỳ khác, phần còn lại để tick sau.
      if (entriesApplied >= MAX_ENTRIES_PER_DRAW_PER_TICK) {
        return { entriesApplied, drained: false };
      }
    }
  }

  /**
   * Ghi delta 1 batch vào 4 collection.
   *
   * `max3dpro_draw_betting_stats` ghi CUỐI vì nó giữ watermark ĐỌC — xem giải thích thứ tự ở
   * {@link syncDraw}. `accountCount` của cặp là counter **phái sinh**: đếm lại distinct
   * account từ `max3dpro_draw_pair_accounts` rồi `$set` tuyệt đối, nên tự hội tụ sau mọi
   * crash (khác `$inc` theo "account mới trong tick" — mất là mất vĩnh viễn).
   */
  private async writeBatch(
    drawId: string,
    acc: Max3dproDrawStatsAccumulator,
    batchMaxId: string,
    stats: OpsStatsConfig,
  ): Promise<void> {
    const pairDeltas = acc.drainPairDeltas();

    if (pairDeltas.length > 0) {
      await this.pairAccountsRepo.bulkUpsertDelta(pairDeltas, batchMaxId);
      await this.pairStatsRepo.bulkUpsertDelta(pairDeltas, batchMaxId);

      const pairKeys = pairDeltas.map((d) => d.pairKey);
      const counts = await this.pairAccountsRepo.countAccountsByPair(drawId, pairKeys);
      await this.pairStatsRepo.syncAccountCounts(drawId, counts);
    }

    await this.accountStatsRepo.bulkUpsertDelta(acc.drainAccountDeltas(), batchMaxId);
    await this.statsRepo.applyDelta(drawId, acc.drainStatsDelta(), batchMaxId, stats);
  }

  /** Gom prize config từ GlobalConfig cho accumulator (unitPrice + prizes + ngưỡng cược lớn). */
  private buildPrizeContext(config: Pick<GlobalConfigEntity, "play" | "defaultPrizes">, ops: OpsConfig): PrizeContext {
    return {
      unitPrice: config.play.unitPrice,
      prizes: config.defaultPrizes.standard,
      largeBetAmount: ops.alerts.largeBetAmount,
    };
  }
}
