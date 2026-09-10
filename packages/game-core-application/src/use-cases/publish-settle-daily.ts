/**
 * Use Case: Publish Settle Daily (Game Core – SHARED)
 *
 * ═══════════════════════════════════════════════════════════════════════
 * DÙNG CHUNG CHO TẤT CẢ GAME — gọi sau BuildSettleReport (settle) hoặc
 * BuildVoidReport (void-after-settle).
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Nhận per-game system repos (đã kế thừa base) để:
 *   1. Aggregate per-game draw reports → UPSERT system_settle_game_daily (CAS)
 *   2. Aggregate per-game tenant reports → UPSERT system_settle_tenant_daily (hàng rào)
 *   3. Xoá doc tenant-daily của tenant không còn trong lô (void-after-settle)
 *
 * Mỗi game tạo SystemSettleGameDailyRepo + SystemSettleTenantDailyRepo
 * kế thừa base repos từ core, truyền vào đây.
 *
 * CRASH-SAFE + RACE-SAFE (CAS trên `version`, xem plan p0-01 —
 * `keno-bingo18-daily-rollup-version-cas.analysis.md`):
 *   - Nhiều kỳ settle đồng thời cùng `financialDate` → CAS optimistic lock chống
 *     ghi đè bằng dữ liệu cũ. Thua CAS → re-aggregate lại từ đầu, KHÔNG ghi lại
 *     report cũ (report đó tính từ snapshot per-game đã lạc hậu).
 *   - Crash sau game_daily upsert: tenant_daily stale. Retry re-aggregate cả 2.
 *   - Crash giữa tenant upserts: partial update. Retry re-aggregate → idempotent.
 *   - Rollup thất bại sau hết lượt CAS → THROW để SFN retry với backoff. Tiền
 *     người chơi đã trả đúng ở draw-level (source of truth); rollup chỉ là báo
 *     cáo tổng hợp và luôn re-aggregate được.
 */

import { UseCase } from "@megawin/app-core/use-cases";
import type { GameProduct } from "@megawin/game-core/entities";

import type {
  SettleGameDailyAggregateResult,
  SettleTenantDailyAggregateResult,
  SystemSettleGameDailyRepository,
  SystemSettleTenantDailyRepository,
} from "../infras/repos";

/** Interface per-game repo phải implement để aggregate per-game draw reports. */
export interface SystemGameDailyPublisher extends SystemSettleGameDailyRepository {
  aggregateDrawsFromPerGame(financialDate: string): Promise<SettleGameDailyAggregateResult>;
}

/** Interface per-game repo phải implement để aggregate per-game tenant reports. */
export interface SystemTenantDailyPublisher extends SystemSettleTenantDailyRepository {
  aggregateTenantsFromPerGame(financialDate: string): Promise<SettleTenantDailyAggregateResult[]>;
}

export interface PublishSettleDailyInput {
  /** Game product để gắn vào system reports. */
  gameProduct: GameProduct;
  /** Ngày tài chính (YYYY-MM-DD). */
  financialDate: string;
  /** Per-game system game daily repo (kế thừa base, có aggregateDrawsFromPerGame). */
  gameDailyRepo: SystemGameDailyPublisher;
  /** Per-game system tenant daily repo (kế thừa base, có aggregateTenantsFromPerGame). */
  tenantDailyRepo: SystemTenantDailyPublisher;
}

export interface PublishSettleDailyResult {
  /** Game product đã publish. */
  gameProduct: GameProduct;
  /** Ngày tài chính đã publish. */
  financialDate: string;
  /** Số draw đã aggregate vào game daily. */
  drawCount: number;
  /** Số tenant đã upsert vào tenant daily. */
  tenantCount: number;
}

/**
 * Số lượt CAS trong process. 3 lượt: đủ hấp thụ tranh chấp ngắn khi nhiều kỳ cùng
 * `financialDate` settle song song (bulk settle từ Ops Hub là case thường gặp nhất).
 * Thua cả 3 lượt nghĩa là tranh chấp kéo dài bất thường — lúc đó throw để SFN retry
 * với backoff tốt hơn là ta tự lặp, vì SFN có visibility (execution history) còn vòng
 * lặp trong Lambda thì không.
 */
const MAX_CAS_ATTEMPTS = 3;

/**
 * Re-aggregate per-game draw-level reports → upsert system daily reports.
 *
 * IDEMPOTENT + RACE-SAFE: chạy lại nhiều lần, hoặc chạy đồng thời nhiều kỳ settle
 * cùng `financialDate`, cho cùng kết quả cuối cùng đúng.
 * KHÔNG dùng $inc cho trường tiền — luôn overwrite toàn bộ bằng $set. `$inc` CHỈ
 * dùng cho `version` (game-daily) — đây là bất biến bắt buộc giữ, xem plan p0-01 §3.6.
 */
export class SystemPublishSettleDailyUseCase extends UseCase<PublishSettleDailyInput, PublishSettleDailyResult> {
  /**
   * Re-aggregate và publish daily reports lên system level, với vòng CAS chống race.
   *
   * Nhận per-game system repos đã kế thừa base từ core.
   * Game void-after-settle: draw-level đã xoá → aggregate giảm → system giảm.
   *
   * Vòng lặp: đọc version + aggregate SONG SONG (Promise.all, không thêm latency) →
   * CAS ghi game-daily. Thua CAS (writer khác ghi chen) → quay lại ĐẦU vòng, aggregate
   * LẠI (không ghi lại report cũ vì nó đã lạc hậu). Thắng CAS → dùng `version` trả về từ
   * `upsertGameDaily` (giá trị SAU `$inc` trong DB) làm `rollupVersion` cho toàn bộ
   * tenant doc của lô này. Hết lượt vẫn thua → throw (không trả sentinel, xem §3.8).
   */
  async execute(input: PublishSettleDailyInput): Promise<PublishSettleDailyResult> {
    const { gameProduct, financialDate, gameDailyRepo, tenantDailyRepo } = input;

    for (let attempt = 1; attempt <= MAX_CAS_ATTEMPTS; attempt++) {
      // Đọc version SONG SONG với aggregate → version check không thêm latency vào
      // đường settle (điểm mấu chốt về chi phí, xem plan p0-01 §3.1).
      const [drawAgg, currentVersion] = await Promise.all([
        gameDailyRepo.aggregateDrawsFromPerGame(financialDate),
        gameDailyRepo.findVersion(financialDate, gameProduct),
      ]);

      const expectedVersion = currentVersion ?? 0;

      const newVersion = await gameDailyRepo.upsertGameDaily(
        {
          gameProduct,
          financialDate,
          drawCount: drawAgg.drawCount,
          entryCount: drawAgg.entryCount,
          playerCount: drawAgg.playerCount,
          tenantCount: drawAgg.tenantCount,
          totalStake: drawAgg.totalStake,
          totalWin: drawAgg.totalWin,
          totalPayout: drawAgg.totalPayout,
          ggr: drawAgg.ggr,
          totalCommission: drawAgg.totalCommission,
          netProfit: drawAgg.netProfit,
        },
        expectedVersion,
      );

      if (newVersion === null) {
        // CAS thua (hoặc E11000 — cùng nghĩa) — có writer khác ghi chen vào giữa.
        // report đang giữ tính từ snapshot per-game đã lạc hậu → PHẢI quay lại đầu
        // vòng để aggregate LẠI, không được chỉ ghi lại report cũ.
        continue;
      }

      // CAS thắng → dùng `version` THẬT sau `$inc` từ DB làm stamp tenant-daily.
      // Không tự `expectedVersion + 1`: một nguồn chân lý, khớp đúng doc vừa ghi.
      const tenantCount = await this.publishTenantDaily({
        tenantDailyRepo,
        gameProduct,
        financialDate,
        rollupVersion: newVersion,
        hasDraws: drawAgg.drawCount > 0,
      });

      return { gameProduct, financialDate, drawCount: drawAgg.drawCount, tenantCount };
    }

    // Hết lượt: throw để SFN retry với backoff (§3.8 plan p0-01). KHÔNG trả sentinel
    // (vd drawCount: -1) — đó tạo một trạng thái mới mà mọi consumer phải biết xử lý.
    throw new Error(
      `[PublishSettleDaily] CAS thất bại sau ${MAX_CAS_ATTEMPTS} lượt: ` +
        `gameProduct=${gameProduct} financialDate=${financialDate}`,
    );
  }

  /**
   * Aggregate tenant-level → bulk upsert system_settle_tenant_daily, kèm dọn tenant
   * đã biến mất khỏi per-game (vd void-after-settle xoá hết vé của tenant đó).
   *
   * `rollupVersion` = `version` game-daily SAU CAS thắng (caller truyền vào). Mọi doc
   * tenant của lô này mang cùng stamp → thứ tự nhất quán với game-daily.
   *
   * Repo dùng hàng rào `rollupVersion: { $lte }` (KHÔNG `$eq`). Hai ví dụ:
   *
   * ── Ví dụ 1: 2 kỳ settle song song cùng ngày (lô mới phải ghi đè lô cũ) ──
   *   t0  Kỳ A CAS thắng → game-daily version=5 → publishTenantDaily(rollupVersion=5)
   *       ghi tenant X = { stake: 100, rollupVersion: 5 }
   *   t1  Kỳ B (settle sau, aggregate đủ hơn) CAS thắng → version=6
   *       → publishTenantDaily(rollupVersion=6), thấy X stake=150
   *   Với `$lte: 6`: doc X (stamp 5) khớp → ghi đè { stake: 150, rollupVersion: 6 } ✓
   *   Với `$eq: 6`:  doc X (stamp 5) KHÔNG khớp → E11000 → X kẹt stake=100 mãi ✗
   *
   * ── Ví dụ 2: SFN retry sau khi ghi tenant dở ──
   *   Lần 1: CAS 0→1, ghi được X stamp=1, crash trước khi ghi Y
   *   Retry:  CAS 1→2, publishTenantDaily(rollupVersion=2), aggregate thấy [X, Y]
   *   Với `$lte: 2`: X (stamp 1) được ghi lại + Y insert mới ✓
   *   Với `$eq: 2`: X (stamp 1) không khớp → chỉ insert được Y, X lệch/cũ ✗
   *
   * ── Ví dụ 3: deleteStale (cùng `$lte`) ──
   *   Lô 6 giữ [X, Y]. Tenant Z còn doc stamp=5 (đã void hết vé, không còn trong agg).
   *   `$lte: 6` + `$nin: [X,Y]` → xoá Z ✓
   *   `$eq: 6` → Z stamp≠6 không bị xoá → báo cáo đại lý Z vẫn hiện số đã void ✗
   *
   * Tóm lại: game-daily dùng `$eq` vì chỉ 1 doc (CAS độc quyền). Tenant là N doc
   * viết SAU khi CAS đã xong — stamp là watermark “lô nào mới hơn”, nên `$lte`.
   */
  private async publishTenantDaily(params: {
    tenantDailyRepo: SystemTenantDailyPublisher;
    gameProduct: GameProduct;
    financialDate: string;
    rollupVersion: number;
    hasDraws: boolean;
  }): Promise<number> {
    const { tenantDailyRepo, gameProduct, financialDate, rollupVersion, hasDraws } = params;

    const tenantAggs = await tenantDailyRepo.aggregateTenantsFromPerGame(financialDate);

    // Bulk upsert tất cả tenants trong 1 DB call — giảm từ N×RTT xuống 1 RTT.
    const written = await tenantDailyRepo.bulkUpsertTenantDaily(
      tenantAggs.map((r) => ({
        financialDate,
        tenantId: r.tenantId,
        gameProduct,
        totalStake: r.totalStake,
        totalWin: r.totalWin,
        totalPayout: r.totalPayout,
        ggr: r.ggr,
        totalCommission: r.totalCommission,
        netProfit: r.netProfit,
        entryCount: r.entryCount,
        playerCount: r.playerCount,
        drawCount: r.drawCount,
      })),
      rollupVersion,
    );

    if (written !== tenantAggs.length) {
      // Có doc bị hàng rào rollupVersion chặn = lô mới hơn đã ghi. Không phải lỗi,
      // nhưng phải log để phân biệt với bug ghi thiếu.
      console.warn("[PublishSettleDaily] tenant doc bị chặn bởi hàng rào rollupVersion", {
        gameProduct,
        financialDate,
        rollupVersion,
        expected: tenantAggs.length,
        written,
      });
    }

    // Tenant đã void hết vé trong ngày KHÔNG còn trong tenantAggs, nhưng doc system
    // của họ vẫn giữ số cũ → báo cáo đại lý tính hoa hồng cho giao dịch đã void.
    await tenantDailyRepo.deleteStaleTenantDaily({
      financialDate,
      gameProduct,
      keepTenantIds: tenantAggs.map((r) => r.tenantId),
      allowEmptyKeep: !hasDraws, // chỉ cho xoá sạch khi thật sự không còn draw nào
      // Cùng stamp với bulkUpsert ở trên — không xoá doc của lô mới hơn (xem repo).
      rollupVersion,
    });

    return tenantAggs.length;
  }
}
