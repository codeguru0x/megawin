/**
 * Player Settle Game Daily Repository (Base)
 *
 * Ghi và query player-level daily settle reports trong MongoDB.
 * 1 doc = 1 player × 1 game × 1 financialDate.
 *
 * Collection: player_settle_game_daily
 *
 * Chỉ làm việc với SHARED collection:
 *   - upsertPlayerDaily        — ghi 1 player daily report
 *   - bulkUpsertPlayerDaily    — bulk ghi nhiều player daily reports
 *   - aggregatePlayerOverview  — KPIs + game breakdown (đọc cho Player Detail)
 *   - findPlayerDailyRecords   — raw docs theo ngày × game (đọc cho tab Tài chính)
 *
 * Per-game aggregate (từ per-game ticket_entries → player daily) nằm ở mỗi game package.
 * Game package tạo subclass hoặc wrapper, truyền aggregation result vào đây.
 *
 * IDEMPOTENT: write dùng upsert overwrite — chạy lại an toàn.
 * KHÔNG CẦN DELETE TRƯỚC — aggregation luôn include settled + void,
 * upsert overwrite doc cũ, không có trường hợp doc stale.
 */

import type {
  PlayerSettleGameDaily,
  PlayerSettleGameDailyEntity,
} from "@megawin/game-core/entities";
import { PLAYER_SETTLE_GAME_DAILY } from "@megawin/game-core/entities";
import { ReportRepo } from "@megawin/data/mongo";
import { PlayerSettleGameDailyMapper } from "../mappers";
import type { PlayerOverviewResult, PlayerGameBreakdownRow } from "./types";

/**
 * Base repository ghi và query player settle game daily reports.
 *
 * Chỉ làm việc với player_settle_game_daily collection.
 * Per-game aggregate logic nằm ở mỗi game package (entry repo → aggregate → truyền vào đây).
 */
export class PlayerSettleGameDailyRepository extends ReportRepo<
  PlayerSettleGameDailyEntity,
  PlayerSettleGameDailyMapper
> {
  constructor() {
    super({
      collName: PLAYER_SETTLE_GAME_DAILY,
      dataMapper: new PlayerSettleGameDailyMapper(),
    });
  }

  /**
   * Upsert thống kê settle/void của 1 player × 1 game × 1 ngày tài chính.
   *
   * Re-aggregate từ per-game ticket_entries → overwrite toàn bộ.
   * Filter: { accountId, gameProduct, financialDate }.
   * IDEMPOTENT: chạy lại an toàn.
   */
  async upsertPlayerDaily(
    report: Omit<PlayerSettleGameDaily, "createdAt" | "updatedAt">,
  ): Promise<void> {
    const now = new Date();
    await this.findOneAndUpdate(
      {
        accountId: report.accountId,
        gameProduct: report.gameProduct,
        financialDate: report.financialDate,
      },
      {
        $set: {
          ...report,
          updatedAt: now,
        },
        $setOnInsert: {
          createdAt: now,
        },
      },
      {
        upsert: true,
      },
    );
  }

  /**
   * Bulk upsert nhiều player daily reports trong 1 DB call.
   *
   * Dùng bulkWrite với N updateOne+upsert thay vì N lần findOneAndUpdate tuần tự.
   * Giảm latency từ N×RTT xuống 1 RTT bất kể số lượng players.
   * IDEMPOTENT: mỗi operation vẫn là upsert overwrite — chạy lại an toàn.
   * Noop-safe: nếu reports rỗng thì không gọi DB.
   */
  async bulkUpsertPlayerDaily(
    reports: Omit<PlayerSettleGameDaily, "createdAt" | "updatedAt">[],
  ): Promise<void> {
    if (reports.length === 0) return;

    const now = new Date();
    await this.bulkWrite(
      reports.map((report) => ({
        updateOne: {
          filter: {
            accountId: report.accountId,
            gameProduct: report.gameProduct,
            financialDate: report.financialDate,
          },
          update: {
            $set: {
              ...report,
              updatedAt: now,
            },
            $setOnInsert: {
              createdAt: now,
            },
          },
          upsert: true,
        },
      })),
    );
  }

  /**
   * Aggregate KPIs + game breakdown của 1 player trong date range.
   *
   * Dùng cho tab "Tổng quan" trang Player Detail — KPI strip + game breakdown table.
   * Query: { accountId, financialDate: [from, to] }
   * Group by gameProduct → SUM tất cả ngày cho mỗi game.
   * Index: { accountId: 1, financialDate: -1 }
   */
  async aggregatePlayerOverview(
    accountId: string,
    from: string,
    to: string,
  ): Promise<PlayerOverviewResult> {
    const result = await this.aggregate([
      // Lọc tất cả docs của player trong date range
      {
        $match: {
          accountId,
          financialDate: {
            $gte: from,
            $lte: to,
          },
        },
      },
      // Nhóm theo game → SUM tất cả ngày cho mỗi game
      {
        $group: {
          _id: "$gameProduct",
          drawCount: { $sum: "$drawCount" },
          entryCount: { $sum: "$entryCount" },
          settledCount: { $sum: "$settledCount" },
          winCount: { $sum: "$winCount" },
          lossCount: { $sum: "$lossCount" },
          voidCount: { $sum: "$voidCount" },
          totalStake: { $sum: "$totalStake" },
          totalPayout: { $sum: "$totalPayout" },
          ggr: { $sum: "$ggr" },
          totalCommission: { $sum: "$totalCommission" },
          netProfit: { $sum: "$netProfit" },
        },
      },
      // Sắp xếp theo doanh thu giảm dần để game chơi nhiều nhất đứng đầu
      {
        $sort: {
          totalStake: -1,
        },
      },
    ]);

    // Map raw aggregate → typed game breakdown rows
    const games: PlayerGameBreakdownRow[] = result.map((r) => ({
      gameProduct: r["_id"] as string,
      drawCount: r["drawCount"] as number,
      entryCount: r["entryCount"] as number,
      settledCount: r["settledCount"] as number,
      winCount: r["winCount"] as number,
      lossCount: r["lossCount"] as number,
      voidCount: r["voidCount"] as number,
      totalStake: r["totalStake"] as number,
      totalPayout: r["totalPayout"] as number,
      ggr: r["ggr"] as number,
      totalCommission: r["totalCommission"] as number,
      netProfit: r["netProfit"] as number,
    }));

    // Tổng hợp cross-game từ game breakdown (sum từ kết quả đã aggregate)
    const totalDrawCount = games.reduce((s, g) => s + g.drawCount, 0);
    const totalEntryCount = games.reduce((s, g) => s + g.entryCount, 0);
    const totalSettledCount = games.reduce((s, g) => s + g.settledCount, 0);
    const totalWinCount = games.reduce((s, g) => s + g.winCount, 0);
    const totalVoidCount = games.reduce((s, g) => s + g.voidCount, 0);
    const totalStake = games.reduce((s, g) => s + g.totalStake, 0);
    const totalPayout = games.reduce((s, g) => s + g.totalPayout, 0);
    const ggr = games.reduce((s, g) => s + g.ggr, 0);
    const totalCommission = games.reduce((s, g) => s + g.totalCommission, 0);
    const netProfit = games.reduce((s, g) => s + g.netProfit, 0);

    return {
      totalDrawCount,
      totalEntryCount,
      totalSettledCount,
      totalWinCount,
      totalVoidCount,
      totalStake,
      totalPayout,
      ggr,
      totalCommission,
      netProfit,
      games,
    };
  }

  /**
   * Raw docs của 1 player theo date range, optional filter theo game.
   *
   * Dùng cho tab "Tài chính" trang Player Detail — bảng chi tiết ngày × game.
   * Query: { accountId, financialDate: [from, to], gameProduct? }
   * Sort: financialDate desc, gameProduct asc.
   * Index: { accountId: 1, financialDate: -1 }
   */
  async findPlayerDailyRecords(
    accountId: string,
    from: string,
    to: string,
    gameProduct?: string,
  ): Promise<PlayerSettleGameDailyEntity[]> {
    const filter: Record<string, unknown> = {
      accountId,
      financialDate: {
        $gte: from,
        $lte: to,
      },
    };

    // Nếu có game filter → thêm vào query, bỏ qua nếu "all" hoặc rỗng
    if (gameProduct && gameProduct !== "all") {
      filter["gameProduct"] = gameProduct;
    }

    return this.findMany(filter as Parameters<typeof this.findMany>[0], {
      sort: { financialDate: -1, gameProduct: 1 },
    });
  }
}
