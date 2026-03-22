/**
 * Use Case: Publish Player Daily (Game Core – SHARED)
 *
 * ═══════════════════════════════════════════════════════════════════════
 * DÙNG CHUNG CHO TẤT CẢ GAME — gọi sau PublishSettleDaily (settle) hoặc
 * BuildVoidReport (void-after-settle).
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Nhận per-game aggregation result (đã aggregate từ ticket_entries) để:
 *   1. Aggregate player stats từ ticket_entries
 *   2. Bulk upsert player daily docs (overwrite)
 *
 * Mỗi game tạo wrapper use case, aggregate từ ticket_entries,
 * rồi truyền result vào đây.
 *
 * KHÔNG CẦN DELETE TRƯỚC — vì:
 *   - Aggregation luôn include status "settled" + "void"
 *   - Player bị void toàn bộ vẫn xuất hiện (voidCount > 0, totalStake = 0)
 *   - Entries không bị xoá khỏi ticket_entries, chỉ thay đổi status
 *   - Upsert overwrite → doc cũ luôn được ghi đè bằng data mới
 *   → Không có trường hợp doc stale mà upsert không fix được.
 *
 * CRASH-SAFE:
 *   - Crash giữa upserts (partial): Retry re-aggregate + upsert lại (idempotent overwrite).
 *   - 1 DB call duy nhất (bulkWrite) thay vì delete + upsert → ít write amplification.
 *
 * FLOW:
 *   Per-game entry repo: aggregate ticket_entries WHERE { financialDate, status ∈ [settled, void] }
 *     → group by { tenantId, accountId } → PlayerDailyAggregateResult[]
 *   → Truyền vào use case này → bulk upsert (overwrite)
 */

import type { GameProduct } from "@megawin/game-core/entities";
import { PlayerSettleGameDailyRepository, type PlayerDailyAggregateResult } from "../infras/repos";
import { InternalUseCase } from "@megawin/app-core/use-cases";

/** Interface per-game repo phải implement để aggregate player stats. */
export interface PlayerDailyPublisher {
  /**
   * Aggregate ticket_entries cho 1 financialDate, group by { tenantId, accountId }.
   *
   * PHẢI include cả status "settled" VÀ "void" trong $match.
   * Entries scheduled (chưa settle) KHÔNG được include.
   * Financial metrics (totalStake, totalWin, totalPayout, totalCommission)
   * chỉ tính entries settled — void entries chỉ đếm voidCount.
   */
  aggregatePlayersFromEntries(financialDate: string): Promise<PlayerDailyAggregateResult[]>;
}

export interface PublishPlayerDailyInput {
  /** Game product để gắn vào player daily docs. */
  gameProduct: GameProduct;
  /** Ngày tài chính (YYYY-MM-DD). */
  financialDate: string;
  /** Per-game entry repo (có method aggregatePlayersFromEntries). */
  playerPublisher: PlayerDailyPublisher;
}

export interface PublishPlayerDailyResult {
  /** Game product đã publish. */
  gameProduct: GameProduct;
  /** Ngày tài chính đã publish. */
  financialDate: string;
  /** Số player đã upsert. */
  playerCount: number;
}

/**
 * Bulk upsert player daily cho 1 game × 1 ngày.
 *
 * IDEMPOTENT: upsert overwrite — chạy lại cho cùng kết quả.
 * KHÔNG dùng $inc — luôn overwrite toàn bộ.
 * KHÔNG cần delete trước — aggregation luôn include settled + void,
 * player bị void toàn bộ vẫn xuất hiện (voidCount > 0), upsert ghi đè đúng.
 */
export class SystemPublishPlayerDailyUseCase extends InternalUseCase<
  PublishPlayerDailyInput,
  PublishPlayerDailyResult
> {
  private readonly playerDailyRepo = new PlayerSettleGameDailyRepository();

  async execute(input: PublishPlayerDailyInput): Promise<PublishPlayerDailyResult> {
    const { gameProduct, financialDate, playerPublisher } = input;

    // ── Bước 1: Aggregate player stats từ per-game ticket_entries ────────
    // Per-game entry repo chạy pipeline trên {game}_ticket_entries,
    // group by { tenantId, accountId } → volumes + financial metrics.
    // Include cả settled + void — player void toàn bộ vẫn có doc (voidCount > 0).
    const playerAggs = await playerPublisher.aggregatePlayersFromEntries(financialDate);

    // ── Bước 2: Bulk upsert player daily ─────────────────────────────────
    // Upsert overwrite — doc cũ (nếu có) bị ghi đè hoàn toàn.
    // Không cần delete trước vì không có trường hợp doc stale:
    //   - Player settled → upsert với data mới
    //   - Player void → upsert với voidCount > 0, totalStake = 0
    //   - Player mới → insert
    if (playerAggs.length > 0) {
      await this.playerDailyRepo.bulkUpsertPlayerDaily(
        playerAggs.map((r) => {
          // ggr chỉ tính trên entries settled: totalStake - totalPayout
          const ggr = r.totalStake - r.totalPayout;
          // netProfit = ggr - totalCommission (có thể âm khi player trúng giải lớn)
          const netProfit = ggr - r.totalCommission;

          return {
            tenantId: r.tenantId,
            accountId: r.accountId,
            gameProduct,
            financialDate,
            drawCount: r.drawCount,
            entryCount: r.entryCount,
            settledCount: r.settledCount,
            winCount: r.winCount,
            lossCount: r.lossCount,
            voidCount: r.voidCount,
            totalStake: r.totalStake,
            totalWin: r.totalWin,
            totalPayout: r.totalPayout,
            ggr,
            totalCommission: r.totalCommission,
            netProfit,
          };
        }),
      );
    }

    return {
      gameProduct,
      financialDate,
      playerCount: playerAggs.length,
    };
  }
}
