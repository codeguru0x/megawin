/**
 * Mega 6/45 – Sync Betting Stats Worker
 *
 * Cập nhật `mega645_draw_betting_stats` (+ number/account/combo stats) async cho mọi kỳ
 * chưa `final` — KHÔNG đụng hot path place-bet (analysis §3.1–3.3). Extends
 * {@link TickLoopWorker}: 1 worker toàn hệ (`mega645:stats-sync`), vòng lặp/budget/cadence
 * nằm ở base class (packages/worker-core) — xem JSDoc `TickLoopWorker` cho cơ chế loop.
 *
 * Port nguyên kiến trúc Power 6/55 (`sync-betting-stats.ts`, xem JSDoc gốc cho lý giải đầy
 * đủ "hàng đợi việc theo trạng thái công việc, không theo status draw" + "vì sao ghi theo
 * batch, không gom cả tick vào RAM"). KHÁC Power 6/55:
 *
 * - Ghi thêm `mega645_draw_number_stats` (tách riêng — không nhúng numberFreq trong stats
 *   doc, xem `Mega645DrawNumberStatsDoc`).
 * - `PrizeContext` chỉ cần `{ unitPrice, tier1, largeBetAmount }` — Mega 6/45 không có
 *   side bet.
 * - `MAX_ENTRIES_PER_DRAW_PER_TICK`/`MAX_DRAWS_PER_TICK` GIỮ NGUYÊN hằng số Power 6/55
 *   (Mega 6/45 thường chỉ 1 kỳ active — giữ để đồng nhất codebase, không có ý nghĩa scale
 *   riêng).
 *
 * ## Mỗi invocation
 *
 * 1. `beforeLoop`: đọc GlobalConfig 1 lần, reset counters, rồi **enroll** — `ensureDocs`
 *    cho mọi kỳ chưa hoàn thành → kỳ mới vào được hàng đợi `final:false`.
 * 2. Mỗi tick: `findNotFinal()` → hàng đợi việc (có trần, sort `drawId` asc để kỳ cũ nhất
 *    được ưu tiên). Mỗi kỳ: đọc entries `_id > watermark RIÊNG của kỳ` theo batch → ghi 5
 *    collection bằng `$inc` idempotent. Query loại `status: Void` NGAY TẠI NGUỒN nên không
 *    cần bước trừ bù.
 * 3. Kỳ ở trạng thái **TERMINAL** (`Settled`/`Void`) và đã hút hết entries → `stampFinal`.
 *
 * Đánh giá alert NGHIỆP VỤ KHÔNG nằm ở worker này — xem `EvaluateOpsAlertsUseCase` (worker
 * `mega645:ops-alerts`, tách theo analysis §5.1: lỗi rule alert không làm chậm sync, backlog
 * sync không làm trễ alert kỳ khác). Sức khoẻ vận hành của CHÍNH worker này (kỳ lỗi lặp lại,
 * worker khoẻ/kẹt) do `worker-core` theo dõi qua `stalledItems` trên lock doc.
 */

import { DRAW_COMPLETED_STATUSES, type DrawStatus } from "@megawin/game-core/entities";
import type { GlobalConfigEntity, OpsStatsConfig } from "@megawin/game-mega645/entities";
import { DEFAULT_MEGA645_CONFIG } from "@megawin/game-mega645/rules";
import { logError } from "@megawin/shared/utils";
import type { TickLoopResult, TickOutcome } from "@megawin/worker-core/workers";
import { LockTakenOverError, TickLoopWorker } from "@megawin/worker-core/workers";

import { AccountStatsRepository } from "../../infras/repos/account-stats-repo";
import { BettingStatsRepository } from "../../infras/repos/betting-stats-repo";
import { ComboAccountsRepository } from "../../infras/repos/combo-accounts-repo";
import { ComboStatsRepository } from "../../infras/repos/combo-stats-repo";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { NumberStatsRepository } from "../../infras/repos/number-stats-repo";
import { GetGlobalConfigInternalUseCase } from "../game-config/get-global-config-internal";
import { Mega645StatsAccumulator, type PrizeContext } from "./stats-accumulator";

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
 * GIỮ NGUYÊN giá trị Power 6/55 (analysis: Mega 6/45 thường chỉ 1 kỳ active/ngày, trần này
 * không mang ý nghĩa scale riêng cho game — giữ để đồng nhất codebase, dễ đối chiếu).
 * Không có trần thì kỳ tồn đọng lớn (worker chết vài giờ rồi bật lại) sẽ hút hết budget
 * invocation và bỏ đói các kỳ khác. Vượt trần thì phần còn lại để tick sau: watermark đã
 * tiến nên tick sau tiếp tục liền mạch, không đọc lại.
 */
const MAX_ENTRIES_PER_DRAW_PER_TICK = 20_000;

/**
 * Trần số kỳ xử lý trong 1 tick — GIỮ NGUYÊN giá trị Power 6/55 (xem JSDoc
 * `MAX_ENTRIES_PER_DRAW_PER_TICK`).
 *
 * `findNotFinal` sort `drawId` asc nên kỳ cũ nhất (sắp settle, cần số chính xác nhất) luôn
 * được ưu tiên; kỳ mới hơn chờ tick sau. Cũng chặn việc `findMany` cắt ngầm ở 500 doc.
 */
const MAX_DRAWS_PER_TICK = 200;

/** Trạng thái TERMINAL: kỳ không bao giờ nhận cược mới nữa ⇒ được đóng dấu `final`. */
const TERMINAL_STATUSES = new Set<DrawStatus>(DRAW_COMPLETED_STATUSES);

export class SyncBettingStatsUseCase extends TickLoopWorker<void, SyncBettingStatsResult> {
  protected readonly ttlSeconds = 120; // = Lambda timeout stats.yml
  protected override readonly description = "Mega 6/45 — đồng bộ thống kê cược theo delta (tick, mọi kỳ đang mở)";

  private readonly getGlobalConfig = new GetGlobalConfigInternalUseCase();
  private readonly drawRepo = new DrawRepository();
  private readonly entryRepo = new EntryRepository();
  private readonly statsRepo = new BettingStatsRepository();
  private readonly numberStatsRepo = new NumberStatsRepository();
  private readonly comboRepo = new ComboStatsRepository();
  private readonly comboAccountsRepo = new ComboAccountsRepository();
  private readonly accountStatsRepo = new AccountStatsRepository();

  // Field instance — Lambda single-threaded, mỗi invocation 1 instance state riêng
  // (cùng giả định với SingleRunWorker._lockKey). PHẢI reset trong beforeLoop
  // vì Lambda container reuse giữ instance sống qua nhiều invocation.
  private prize!: PrizeContext;
  private statsConfig!: OpsStatsConfig;
  private counters = { entriesApplied: 0, finalized: 0, failed: 0 };

  protected resolveLockKey(): string {
    return "mega645:stats-sync";
  }

  protected override async beforeLoop(): Promise<void> {
    const config = await this.getGlobalConfig.run();
    this.prize = this.buildPrizeContext(config);
    // R7 (p0-02 plan): doc GlobalConfig cũ (trước p0-01) KHÔNG có field `ops` — mapper
    // hiện tại (p0-01) CHƯA merge default (đó là việc của p0-03 GetGameConfigUseCase cho
    // BO). Worker là consumer ĐẦU TIÊN đọc `config.ops` nên PHẢI tự vệ ở đây: merge
    // `DEFAULT_MEGA645_CONFIG.ops` khi thiếu, tránh crash `beforeLoop` (R2 p0-01, R7 p0-02).
    this.statsConfig = config.ops?.stats ?? DEFAULT_MEGA645_CONFIG.ops.stats;
    this.counters = { entriesApplied: 0, finalized: 0, failed: 0 }; // reset — container reuse

    // Enroll 1 lần/invocation (đồng bộ lý luận Power 6/55): draws được staff tạo batch cho
    // cả tuần; kỳ tạo GIỮA invocation chờ tối đa ~55s để vào hàng đợi — vô nghĩa so với chu
    // kỳ draw. Nhờ vậy `runTick` còn đúng 1 câu chuyện: lấy hàng đợi → hút delta → đóng dấu.
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

    // Đặt tên `drawCursor` (khác `cursor` cục bộ trong `syncDraw`) — đây là 1 ITEM hàng đợi
    // { drawId, lastEntryId }, KHÔNG phải vị trí đọc đang chạy.
    for (const drawCursor of cursors) {
      // 1 kỳ lỗi (data bẩn, doc quá cỡ…) KHÔNG được làm chết cả tick — các kỳ còn lại,
      // nhất là kỳ đang mở bán, vẫn phải được cập nhật.
      try {
        const applied = await this.syncDraw(drawCursor.drawId, drawCursor.lastEntryId, this.prize, this.statsConfig);
        this.counters.entriesApplied += applied.entriesApplied;
        this.clearStalledItem(drawCursor.drawId); // kỳ qua được → xoá streak

        // Đóng dấu `final` CHỈ khi kỳ ở trạng thái terminal VÀ đã hút hết entries. `SalesClosed`
        // KHÔNG phải terminal: kỳ có thể mở bán lại, đóng dấu sớm sẽ mất cược sau đó.
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
   * entries thay vì toàn bộ tồn đọng; (2) crash giữa tick chỉ mất tối đa 1 batch, batch
   * trước đã bền; (3) watermark tiến dần nên không bao giờ đọc lại phần đã cộng.
   *
   * Thứ tự ghi có Ý NGHĨA — xem JSDoc {@link writeBatch}.
   *
   * ## 1 khái niệm watermark — 3 tên PHÂN VAI theo giai đoạn (KHÔNG dùng lẫn)
   *
   * - `lastEntryId` (param + field DB): watermark ĐỌC VÀO — vị trí đã cộng tới lúc BẮT ĐẦU
   *   gọi hàm này.
   * - `cursor` (local, mutable): watermark trong lúc vòng đọc ĐANG CHẠY — tiến dần sau mỗi
   *   batch, dùng làm filter `_id >` cho lần đọc kế tiếp.
   * - `batchMaxId`: watermark MỚI vừa tính xong từ batch hiện tại — dùng để tiến `cursor` VÀ
   *   để ghi xuống DB.
   *
   * @param drawId - Kỳ cần đồng bộ.
   * @param lastEntryId - Watermark bắt đầu đọc. `undefined` = kỳ mới → đọc từ đầu.
   * @param prize - Prize context để tính exposure (worst-case giải cố định).
   * @param stats - `ops.stats` — truyền xuống {@link writeBatch} cho `$slice` top-K.
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

      const acc = new Mega645StatsAccumulator(drawId, prize);
      for (const entry of entries) {
        acc.addEntry(entry);
      }

      // batchMaxId = watermark mới của batch này (xem giải thích 3 tên ở JSDoc method).
      const batchMaxId = entries[entries.length - 1]!.id;
      await this.writeBatch(drawId, acc, batchMaxId, stats);

      entriesApplied += entries.length;
      cursor = batchMaxId; // tiến watermark cho vòng đọc kế tiếp

      // Gia hạn lock TRONG vòng đọc: kỳ tồn đọng lớn có thể vượt TTL ngay giữa 1 tick →
      // lock hết hạn, worker khác takeover và 2 writer cùng ghi.
      const ok = await this.extendLock();
      if (!ok) {
        throw new LockTakenOverError("mega645:stats-sync");
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
   * Ghi delta 1 batch vào 5 collection.
   *
   * Thứ tự ghi theo analysis §4.2(3): **comboAccounts → comboStats → `countAccountsByCombo`
   * + `syncAccountCounts` → accountStats → numberStats → stats doc CUỐI CÙNG**. Stats doc
   * mang watermark ĐỌC (`lastEntryId`) nên phải ghi cuối: crash giữa chừng → watermark chưa
   * tiến → tick sau đọc lại đúng batch đó → các collection đã ghi thấy `lastEntryId` đã ≥
   * batch nên no-op (idempotent per-doc), collection chưa ghi thì được áp — hệ TỰ HỘI TỤ,
   * KHÔNG cần transaction cross-collection.
   *
   * `accountCount` của combo là counter **phái sinh**: đếm lại distinct account từ
   * `mega645_draw_combo_accounts` rồi `$set` tuyệt đối, nên tự hội tụ sau mọi crash (khác
   * `$inc` theo "account mới trong tick" — mất là mất vĩnh viễn).
   */
  private async writeBatch(
    drawId: string,
    acc: Mega645StatsAccumulator,
    batchMaxId: string,
    stats: OpsStatsConfig,
  ): Promise<void> {
    const comboDeltas = acc.drainComboDeltas();

    if (comboDeltas.length > 0) {
      await this.comboAccountsRepo.bulkUpsertDelta(comboDeltas, batchMaxId);
      await this.comboRepo.bulkUpsertDelta(comboDeltas, batchMaxId);

      const comboKeys = comboDeltas.map((d) => d.comboKey);
      const counts = await this.comboAccountsRepo.countAccountsByCombo(drawId, comboKeys);
      await this.comboRepo.syncAccountCounts(drawId, counts);
    }

    await this.accountStatsRepo.bulkUpsertDelta(acc.drainAccountDeltas(), batchMaxId);
    await this.numberStatsRepo.bulkUpsertDelta(acc.drainNumberDeltas(), batchMaxId);
    await this.statsRepo.applyDelta(drawId, acc.drainStatsDelta(), batchMaxId, stats.topPotentialK);
  }

  /** Gom prize config từ GlobalConfig để tính worst-case exposure. */
  private buildPrizeContext(config: Pick<GlobalConfigEntity, "play" | "defaultPrizes" | "ops">): PrizeContext {
    return {
      unitPrice: config.play.unitPrice,
      tier1: config.defaultPrizes.tier1,
      // Cùng lý do merge-default ở `beforeLoop` — xem comment tại đó.
      largeBetAmount: config.ops?.alerts.largeBetAmount ?? DEFAULT_MEGA645_CONFIG.ops.alerts.largeBetAmount,
    };
  }
}
