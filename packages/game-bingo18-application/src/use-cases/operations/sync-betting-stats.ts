/**
 * Bingo 18 – Sync Betting Stats Worker
 *
 * Cập nhật `bingo18_draw_betting_stats` async cho mọi kỳ chưa `final` — KHÔNG đụng hot path
 * place-bet (analysis §3.1–3.3). Extends {@link TickLoopWorker}: 1 worker toàn hệ
 * (`bingo18:stats-sync`), vòng lặp/budget/cadence nằm ở base class
 * (packages/worker-core) — xem JSDoc `TickLoopWorker` cho cơ chế loop.
 *
 * ## Hàng đợi việc: trạng thái công việc, không phải status draw
 *
 * Nguồn điều phối là `final: false` trên chính stats doc — KHÔNG suy ra từ status draw
 * (`SalesOpen`/`SalesClosed`/…). Nhờ vậy bền với mọi tốc độ chuyển status: kỳ có thể lướt
 * qua nhiều status giữa 2 tick mà vẫn không bị bỏ sót, vì nó luôn còn trong hàng đợi cho
 * đến khi được đóng dấu `final`. Bingo 18 nhiều kỳ active đồng thời (vé multi-draw 20 kỳ)
 * nên kỳ `Scheduled`/`SalesClosed`/`Published`/`Settling` ĐỀU được hút delta (khác worker cũ
 * chỉ quét `[SalesOpen]` + recompute riêng POST_CLOSE — F4-e).
 *
 * ## Mỗi invocation
 *
 * 1. `beforeLoop`: đọc GlobalConfig 1 lần, reset counters, rồi **enroll** — `ensureDocs`
 *    cho mọi kỳ chưa hoàn thành → kỳ mới vào được hàng đợi `final:false`. Enroll chạy 1
 *    lần/invocation (không phải mỗi tick): kỳ tạo GIỮA invocation chờ tối đa ~55s để vào
 *    hàng đợi — vô nghĩa so với chu kỳ draw 6 phút. Entries của kỳ mới nằm yên trong
 *    `bingo18_ticket_entries` (insert-only) chờ invocation sau enroll rồi drain, KHÔNG mất.
 * 2. Mỗi tick: `findNotFinal()` → hàng đợi việc (có trần, sort `drawId` asc để kỳ cũ nhất
 *    được ưu tiên). Mỗi kỳ: đọc entries `_id > watermark RIÊNG của kỳ` theo batch → ghi
 *    `bingo18_draw_betting_stats` bằng `$inc` idempotent. Query loại `status: Void` NGAY TẠI
 *    NGUỒN (`EntryRepository.getEntriesForStatsAfter`) nên không cần bước trừ bù.
 * 3. Kỳ ở trạng thái **TERMINAL** (`Settled`/`Void`) và đã hút hết entries → `stampFinal`.
 *
 * Đánh giá alert NGHIỆP VỤ KHÔNG còn nằm ở worker này — chuyển sang `EvaluateOpsAlertsUseCase`
 * (worker `bingo18:ops-alerts`, tách theo p0-02: lỗi rule alert không làm chậm sync, backlog
 * sync không làm trễ alert kỳ khác). Sức khoẻ vận hành của CHÍNH worker này (kỳ lỗi lặp lại,
 * worker khoẻ/kẹt) do `worker-core` theo dõi qua `stalledItems` trên lock doc — xem
 * `SingleRunWorker.recordStalledItem`/`clearStalledItem` — KHÔNG còn bắn alert riêng.
 */

import type { GlobalConfigEntity, OpsConfig, OpsStatsConfigBase } from "@megawin/game-bingo18/entities";
import { DEFAULT_BINGO18_CONFIG } from "@megawin/game-bingo18/rules";
import { DRAW_COMPLETED_STATUSES, type DrawStatus } from "@megawin/game-core/entities";
import { logError } from "@megawin/shared/utils";
import type { TickLoopResult, TickOutcome } from "@megawin/worker-core/workers";
import { LockTakenOverError, TickLoopWorker } from "@megawin/worker-core/workers";

import { AccountStatsRepository } from "../../infras/repos/account-stats-repo";
import { BettingStatsRepository } from "../../infras/repos/betting-stats-repo";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { GetGlobalConfigInternalUseCase } from "../game-config/get-global-config-internal";
import { Bingo18DrawStatsAccumulator, type PrizeContext } from "./stats-accumulator";

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
  protected override readonly description = "Bingo 18 — đồng bộ thống kê cược";

  private readonly getGlobalConfig = new GetGlobalConfigInternalUseCase();
  private readonly drawRepo = new DrawRepository();
  private readonly entryRepo = new EntryRepository();
  private readonly statsRepo = new BettingStatsRepository();
  private readonly accountStatsRepo = new AccountStatsRepository();

  // Field instance — Lambda single-threaded, mỗi invocation 1 instance state riêng
  // (cùng giả định với SingleRunWorker._lockKey). PHẢI reset trong beforeLoop
  // vì Lambda container reuse giữ instance sống qua nhiều invocation (F7).
  private prize!: PrizeContext;
  private statsConfig!: OpsStatsConfigBase;
  private counters = { entriesApplied: 0, finalized: 0, failed: 0 };

  protected resolveLockKey(): string {
    return "bingo18:stats-sync";
  }

  protected override async beforeLoop(): Promise<void> {
    const config = await this.getGlobalConfig.run();
    // Doc cũ (trước khi thêm section ops) chưa có field → fallback default để worker
    // không crash trước lần staff save config đầu tiên.
    const ops: OpsConfig = config.ops ?? DEFAULT_BINGO18_CONFIG.ops;
    this.prize = this.buildPrizeContext(config, ops);
    this.statsConfig = ops.stats;
    this.counters = { entriesApplied: 0, finalized: 0, failed: 0 }; // reset — container reuse

    // Enroll 1 lần/invocation (F4-f): draws được staff tạo batch cho cả ngày; kỳ tạo GIỮA
    // invocation chờ tối đa ~55s để vào hàng đợi — vô nghĩa so với chu kỳ 6 phút. Nhờ vậy
    // `runTick` còn đúng 1 câu chuyện: lấy hàng đợi → hút delta → đóng dấu.
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
    // có thể đã terminal từ lâu (worker chết rồi bật lại) nên KHÔNG suy ra từ bước 1 (F4-a).
    const statusByDraw = await this.drawRepo.getStatusesByDrawIds(cursors.map((c) => c.drawId));

    // Đặt tên `drawCursor` (khác `cursor` cục bộ trong `syncDraw`) — đây là 1 ITEM hàng đợi
    // { drawId, lastEntryId }, KHÔNG phải vị trí đọc đang chạy. Dùng chung tên "cursor" cho
    // cả 2 khái niệm khác nhau ở 2 scope lồng nhau từng gây nhầm lẫn khi đọc code.
    for (const drawCursor of cursors) {
      // 1 kỳ lỗi (data bẩn, doc quá cỡ…) KHÔNG được làm chết cả tick — các kỳ còn lại,
      // nhất là kỳ đang mở bán, vẫn phải được cập nhật (F4-d).
      try {
        const applied = await this.syncDraw(drawCursor.drawId, drawCursor.lastEntryId, this.prize, this.statsConfig);

        this.counters.entriesApplied += applied.entriesApplied;
        this.clearStalledItem(drawCursor.drawId); // kỳ qua được → xoá streak

        // Đóng dấu `final` CHỈ khi kỳ ở trạng thái terminal VÀ đã hút hết entries. `SalesClosed`
        // KHÔNG phải terminal: kỳ có thể mở bán lại, đóng dấu sớm sẽ mất cược sau đó (F4-b).
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
        // KHÔNG có I/O ⇒ không thể throw ⇒ không cần try/catch bọc ngoài.
        this.recordStalledItem(drawCursor.drawId, error);
      }
    }

    return {};
  }

  /**
   * Hút entries mới của 1 kỳ theo watermark rồi ghi delta — mỗi batch là 1 đơn vị bền vững.
   *
   * Ghi theo TỪNG BATCH (không gom cả tick vào RAM) vì: (1) RAM bị chặn ở `READ_BATCH`
   * entries thay vì toàn bộ tồn đọng; (2) crash giữa tick chỉ mất tối đa 1 batch, batch
   * trước đã bền; (3) watermark tiến dần nên không bao giờ đọc lại phần đã cộng.
   *
   * ## 1 khái niệm watermark — 3 tên PHÂN VAI theo giai đoạn (KHÔNG dùng lẫn)
   *
   * - `lastEntryId` (param + field DB, khớp `DrawStatsCursor.lastEntryId`): watermark
   *   ĐỌC VÀO — vị trí đã cộng tới lúc BẮT ĐẦU gọi hàm này.
   * - `cursor` (local, mutable): watermark trong lúc vòng đọc ĐANG CHẠY — tiến dần sau
   *   mỗi batch, dùng làm filter `_id >` cho lần đọc kế tiếp.
   * - `batchMaxId`: watermark MỚI vừa tính xong từ batch hiện tại — dùng để tiến `cursor`
   *   VÀ để ghi xuống DB, tên khớp 1:1 tham số cùng tên ở {@link writeBatch} và
   *   {@link BettingStatsRepository.applyDelta}.
   *
   * @param drawId - Kỳ cần đồng bộ.
   * @param lastEntryId - Watermark bắt đầu đọc, lấy từ `DrawStatsCursor.lastEntryId`.
   *   `undefined` = kỳ mới (chưa áp batch nào) → đọc từ đầu.
   * @param prize - Prize context cho accumulator (bảng giải + ngưỡng cược lớn).
   * @param stats - `ops.stats` — truyền xuống {@link writeBatch} cho `$slice` top-K.
   * @returns Số entries đã cộng và `drained` = đã hút cạn entries của kỳ trong tick này.
   */
  private async syncDraw(
    drawId: string,
    lastEntryId: string | undefined,
    prize: PrizeContext,
    stats: OpsStatsConfigBase,
  ): Promise<{ entriesApplied: number; drained: boolean }> {
    let cursor = lastEntryId;
    let entriesApplied = 0;

    while (true) {
      const entries = await this.entryRepo.getEntriesForStatsAfter(drawId, cursor, READ_BATCH);
      if (entries.length === 0) {
        return { entriesApplied, drained: true };
      }

      const acc = new Bingo18DrawStatsAccumulator(drawId, prize);
      for (const entry of entries) {
        acc.addEntry(entry);
      }

      // batchMaxId = watermark mới của batch này (xem giải thích 3 tên ở JSDoc method).
      const batchMaxId = entries[entries.length - 1]!.id;
      await this.writeBatch(drawId, acc, batchMaxId, stats);

      entriesApplied += entries.length;
      cursor = batchMaxId; // tiến watermark cho vòng đọc kế tiếp

      // Gia hạn lock TRONG vòng đọc: kỳ tồn đọng lớn có thể vượt TTL ngay giữa 1 tick →
      // lock hết hạn, worker khác takeover và 2 writer cùng ghi (F4-c). Heartbeat ở
      // đây thay vì chỉ sau mỗi tick.
      const ok = await this.extendLock();
      if (!ok) {
        throw new LockTakenOverError("bingo18:stats-sync");
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
   * Ghi delta 1 batch — account TRƯỚC, stats SAU CÙNG (giữ watermark ĐỌC ở stats doc).
   *
   * `bingo18_draw_betting_stats.lastEntryId` điều phối `findNotFinal`. Ghi account trước,
   * stats sau → crash giữa: tick sau đọc lại batch, account thấy `lastEntryId ≥ batch` nên
   * no-op (idempotent), stats chưa ghi thì áp. Hệ tự hội tụ, KHÔNG cần transaction (mẫu Keno
   * `writeBatch` JSDoc). Đảo thứ tự (stats trước, account sau) sẽ tạo khe hở: crash giữa 2
   * lệnh → doc account "chưa từng cộng" tick này VĨNH VIỄN nếu status đã terminal + drained
   * (watermark stats đã tiến, `findNotFinal` không còn trả kỳ này để retry).
   */
  private async writeBatch(
    drawId: string,
    acc: Bingo18DrawStatsAccumulator,
    batchMaxId: string,
    stats: OpsStatsConfigBase,
  ): Promise<void> {
    await this.accountStatsRepo.bulkUpsertDelta(acc.drainAccountDeltas(), batchMaxId);
    await this.statsRepo.applyDelta(drawId, acc.drainStatsDelta(), batchMaxId, stats);
  }

  /** Gom prize config từ GlobalConfig cho accumulator. */
  private buildPrizeContext(
    config: Pick<
      GlobalConfigEntity,
      "play" | "singleNumPrizes" | "doubleMatchPrizes" | "tripleMatchPrizes" | "sumTotalPrizes" | "bigSmallDrawPrizes"
    >,
    ops: OpsConfig,
  ): PrizeContext {
    return {
      unitPrice: config.play.unitPrice,
      prizes: {
        singleNum: config.singleNumPrizes,
        doubleMatch: config.doubleMatchPrizes,
        tripleMatch: config.tripleMatchPrizes,
        sumTotal: config.sumTotalPrizes,
        bigSmallDraw: config.bigSmallDrawPrizes,
      },
      largeBetAmount: ops.alerts.largeBetAmount,
    };
  }
}
