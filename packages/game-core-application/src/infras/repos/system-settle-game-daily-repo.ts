/**
 * System Settle Game Daily Repository (Base)
 *
 * Ghi và query system-level game daily settle reports trong MongoDB.
 * 1 doc = 1 game × 1 financialDate.
 *
 * Collection: system_settle_game_daily
 *
 * Chỉ làm việc với SYSTEM collection:
 *   - upsertGameDaily            — ghi per-game aggregate vào system
 *   - aggregateByFinancialDate   — query tổng hợp theo ngày
 *   - aggregateByGameProduct     — query tổng hợp theo game
 *   - aggregateByPeriod          — chuỗi thời gian (ngày/tuần/tháng), lọc được 1 game
 *   - aggregateByPeriodPerGame   — chuỗi thời gian, PIVOT theo game để so sánh N game trên 1 chỉ số
 *   - findByFinancialDate        — raw docs cho 1 ngày
 *
 * Per-game aggregate (từ per-game draw reports → system) nằm ở mỗi game package.
 * Game package thừa kế class này, thêm perGameColl + aggregateAndPublish().
 *
 * IDEMPOTENT: write dùng upsert overwrite — chạy lại an toàn.
 */

import { ReportRepo } from "@megawin/data/mongo";
import type { SystemSettleGameDaily, SystemSettleGameDailyEntity } from "@megawin/game-core/entities";
import { SYSTEM_SETTLE_GAME_DAILY } from "@megawin/game-core/entities";
import type { FinancialPeriod } from "@megawin/shared/utils";
import { financialPeriodKey } from "@megawin/shared/utils";

import { SystemSettleGameDailyMapper } from "../mappers";
import type {
  DailyOverviewRow,
  DashboardGameDailyData,
  GamePeriodByGameRow,
  GamePeriodMetricKey,
  GamePeriodRow,
  GameSummaryRow,
} from "./types";

/**
 * Base repository ghi và query system game daily settle reports.
 *
 * Chỉ làm việc với system_settle_game_daily collection.
 * Per-game aggregate logic nằm ở subclass trong mỗi game package.
 */
export class SystemSettleGameDailyRepository extends ReportRepo<
  SystemSettleGameDailyEntity,
  SystemSettleGameDailyMapper
> {
  constructor() {
    super({
      collName: SYSTEM_SETTLE_GAME_DAILY,
      dataMapper: new SystemSettleGameDailyMapper(),
    });
  }

  /**
   * Upsert tổng hợp settle của 1 game trong 1 ngày tài chính.
   *
   * Re-aggregate từ per-game draw-level reports → overwrite toàn bộ.
   * Filter: { financialDate, gameProduct }.
   * IDEMPOTENT: chạy lại an toàn.
   */
  async upsertGameDaily(report: Omit<SystemSettleGameDaily, "createdAt" | "updatedAt">): Promise<void> {
    const now = new Date();
    await this.findOneAndUpdate(
      {
        financialDate: report.financialDate,
        gameProduct: report.gameProduct,
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
   * Aggregate by financialDate — SUM tất cả game cho mỗi ngày trong date range.
   *
   * Query vào system_settle_game_daily, group by financialDate.
   * Sort theo financialDate descending.
   * Dùng cho tab "Tổng quan ngày" trong System Financial Reports.
   * Index: { financialDate: 1 }
   */
  async aggregateByFinancialDate(from: string, to: string): Promise<DailyOverviewRow[]> {
    const result = await this.aggregate([
      // Lọc docs trong date range
      {
        $match: {
          financialDate: {
            $gte: from,
            $lte: to,
          },
        },
      },
      // Nhóm theo ngày tài chính → SUM tất cả game
      {
        $group: {
          _id: "$financialDate",
          drawCount: { $sum: "$drawCount" },
          entryCount: { $sum: "$entryCount" },
          playerCount: { $sum: "$playerCount" },
          tenantCount: { $max: "$tenantCount" },
          totalStake: { $sum: "$totalStake" },
          totalWin: { $sum: "$totalWin" },
          totalPayout: { $sum: "$totalPayout" },
          ggr: { $sum: "$ggr" },
          totalCommission: { $sum: "$totalCommission" },
          netProfit: { $sum: "$netProfit" },
        },
      },
      // Sắp xếp mới nhất trước
      {
        $sort: {
          _id: -1,
        },
      },
    ]);

    return result.map((r) => ({
      financialDate: r["_id"] as string,
      drawCount: r["drawCount"] as number,
      entryCount: r["entryCount"] as number,
      playerCount: r["playerCount"] as number,
      tenantCount: r["tenantCount"] as number,
      totalStake: r["totalStake"] as number,
      totalWin: r["totalWin"] as number,
      totalPayout: r["totalPayout"] as number,
      ggr: r["ggr"] as number,
      totalCommission: r["totalCommission"] as number,
      netProfit: r["netProfit"] as number,
    }));
  }

  /**
   * Aggregate by gameProduct — SUM tất cả ngày cho mỗi game trong date range.
   *
   * Query vào system_settle_game_daily, group by gameProduct.
   * Dùng cho tab "Theo game" trong System Financial Reports.
   * Index: { financialDate: 1, gameProduct: 1 }
   *
   * @param game - Lọc 1 game (trả đúng 1 dòng). Bỏ trống = tất cả game.
   */
  async aggregateByGameProduct(from: string, to: string, game?: string): Promise<GameSummaryRow[]> {
    const match: Record<string, unknown> = {
      financialDate: {
        $gte: from,
        $lte: to,
      },
    };
    if (game !== undefined) {
      match["gameProduct"] = game;
    }

    const result = await this.aggregate([
      // Lọc docs trong date range (+ 1 game nếu có)
      {
        $match: match,
      },
      // Nhóm theo game product → SUM tất cả ngày
      {
        $group: {
          _id: "$gameProduct",
          drawCount: { $sum: "$drawCount" },
          entryCount: { $sum: "$entryCount" },
          playerCount: { $sum: "$playerCount" },
          tenantCount: { $max: "$tenantCount" },
          totalStake: { $sum: "$totalStake" },
          totalWin: { $sum: "$totalWin" },
          totalPayout: { $sum: "$totalPayout" },
          ggr: { $sum: "$ggr" },
          totalCommission: { $sum: "$totalCommission" },
          netProfit: { $sum: "$netProfit" },
        },
      },
      // Sắp xếp theo doanh thu giảm dần
      {
        $sort: {
          totalStake: -1,
        },
      },
    ]);

    return result.map((r) => ({
      gameProduct: r["_id"] as string,
      drawCount: r["drawCount"] as number,
      entryCount: r["entryCount"] as number,
      playerCount: r["playerCount"] as number,
      tenantCount: r["tenantCount"] as number,
      totalStake: r["totalStake"] as number,
      totalWin: r["totalWin"] as number,
      totalPayout: r["totalPayout"] as number,
      ggr: r["ggr"] as number,
      totalCommission: r["totalCommission"] as number,
      netProfit: r["netProfit"] as number,
    }));
  }

  /**
   * Aggregate theo KỲ THỜI GIAN — 1 dòng = 1 ngày/tuần/tháng, có thể giới hạn 1 game.
   *
   * Sinh ra cho câu hỏi dạng chuỗi thời gian của MỘT game ("doanh thu Keno 6 tháng đầu năm"):
   * `aggregateByGameProduct` gộp cả khoảng thành 1 dòng/game (mất trục thời gian), còn
   * `aggregateByFinancialDate` có trục thời gian nhưng không lọc được game và chỉ chia theo ngày.
   * Trước khi có method này, câu hỏi đó buộc phải gọi báo cáo nhiều lần rồi tự ghép — và biểu đồ
   * dựng từ MỘT lần gọi sẽ vẽ sai dữ liệu (lỗi thật 24/08, xem `agent/tools/renderChart.ts`).
   *
   * Gộp kỳ làm trong TS (không phải trong pipeline): `$group` chỉ chia theo `financialDate`, sau
   * đó roll-up bằng `financialPeriodKey`. Lý do là tuần ISO — tính trong pipeline cần `$dateTrunc`
   * (đòi server ≥ 5.0) hoặc nhãn `"2026-W25"` khó đọc, trong khi roll-up ở đây cho CẢ BA độ chia
   * đi qua đúng một hàm thuần đã có test. Khối lượng chuyển về là số NGÀY trong khoảng (tối đa vài
   * trăm dòng), không phải số document.
   *
   * `playerCount` CỘNG dồn theo ngày ⇒ người chơi hoạt động nhiều ngày bị đếm lặp. Đây là quy ước
   * đang dùng sẵn ở `aggregateByGameProduct`/`aggregateByFinancialDate` — giữ nguyên cho số liệu
   * nhất quán giữa các tab, KHÔNG phải số người chơi duy nhất. `tenantCount` lấy `$max` vì đại lý
   * xuất hiện lại mỗi ngày.
   *
   * Index: `{ financialDate: 1, gameProduct: 1 }`.
   *
   * @param params.game - Lọc 1 game. Bỏ trống = SUM toàn bộ game trong mỗi kỳ.
   * @returns Dòng theo kỳ, sắp TĂNG dần theo thời gian (đúng chiều đọc biểu đồ xu hướng).
   */
  async aggregateByPeriod(params: {
    from: string;
    to: string;
    period: FinancialPeriod;
    game?: string;
  }): Promise<GamePeriodRow[]> {
    const { from, to, period, game } = params;
    const match: Record<string, unknown> = {
      financialDate: {
        $gte: from,
        $lte: to,
      },
    };
    if (game !== undefined) {
      match["gameProduct"] = game;
    }

    const daily = await this.aggregate([
      {
        $match: match,
      },
      // Nhóm theo ngày tài chính — bước gộp kỳ (tuần/tháng) làm ở dưới, xem JSDoc.
      {
        $group: {
          _id: "$financialDate",
          drawCount: { $sum: "$drawCount" },
          entryCount: { $sum: "$entryCount" },
          playerCount: { $sum: "$playerCount" },
          tenantCount: { $max: "$tenantCount" },
          totalStake: { $sum: "$totalStake" },
          totalWin: { $sum: "$totalWin" },
          totalPayout: { $sum: "$totalPayout" },
          ggr: { $sum: "$ggr" },
          totalCommission: { $sum: "$totalCommission" },
          netProfit: { $sum: "$netProfit" },
        },
      },
      {
        $sort: {
          _id: 1,
        },
      },
    ]);

    const buckets = new Map<string, GamePeriodRow>();
    for (const row of daily) {
      const key = financialPeriodKey(row["_id"] as string, period);
      const bucket = buckets.get(key);
      if (bucket === undefined) {
        buckets.set(key, {
          period: key,
          drawCount: row["drawCount"] as number,
          entryCount: row["entryCount"] as number,
          playerCount: row["playerCount"] as number,
          tenantCount: row["tenantCount"] as number,
          totalStake: row["totalStake"] as number,
          totalWin: row["totalWin"] as number,
          totalPayout: row["totalPayout"] as number,
          ggr: row["ggr"] as number,
          totalCommission: row["totalCommission"] as number,
          netProfit: row["netProfit"] as number,
        });
        continue;
      }
      bucket.drawCount += row["drawCount"] as number;
      bucket.entryCount += row["entryCount"] as number;
      bucket.playerCount += row["playerCount"] as number;
      bucket.tenantCount = Math.max(bucket.tenantCount, row["tenantCount"] as number);
      bucket.totalStake += row["totalStake"] as number;
      bucket.totalWin += row["totalWin"] as number;
      bucket.totalPayout += row["totalPayout"] as number;
      bucket.ggr += row["ggr"] as number;
      bucket.totalCommission += row["totalCommission"] as number;
      bucket.netProfit += row["netProfit"] as number;
    }

    // `financialPeriodKey` bảo đảm sort chuỗi = sort thời gian cho cả 3 độ chia.
    return [...buckets.values()].toSorted((a, b) => a.period.localeCompare(b.period));
  }

  /**
   * Aggregate theo KỲ THỜI GIAN, PIVOT theo game — 1 dòng = 1 kỳ, mỗi game trong `games` là 1 cột
   * số riêng chứa giá trị của `metric`.
   *
   * Sinh ra cho câu hỏi SO SÁNH nhiều game theo thời gian trên CÙNG một chỉ số ("so sánh doanh thu
   * thuần Keno và Power 6/55 theo tháng"): {@link aggregateByPeriod} chỉ lọc được ĐÚNG 1 game/lần
   * gọi, nên so sánh N game theo tháng phải gọi N lần — và biểu đồ dựng từ MỘT lần gọi
   * (`renderChart` chế độ đọc-tool-trước) không thể ghép lại được, y hệt sự cố 24/08 nhưng ở biến
   * thể "nhiều game" thay vì "nhiều tháng". Method này gộp N lần gọi đó thành MỘT, để `renderChart`
   * có đúng 1 output chứa toàn bộ dữ liệu cần vẽ.
   *
   * Query 1 lần cho TẤT CẢ game trong `games` (không lặp theo game), gộp kỳ trong TS giống
   * {@link aggregateByPeriod} — cùng lý do (tuần ISO khó gộp trong pipeline).
   *
   * Kỳ nào một game không có dữ liệu (không phát sinh giao dịch) → cột game đó tại kỳ đó là `0`,
   * KHÔNG bỏ dòng và KHÔNG để `undefined` — biểu đồ/model cần phân biệt "bằng 0" với "thiếu dòng".
   *
   * @param params.games - Danh sách game cần so sánh (≥ 2, thường ≤ 4 — nhiều hơn thì chart rối).
   * @param params.metric - MỘT chỉ số duy nhất để so sánh (vd `"ggr"`, `"totalStake"`).
   * @returns Dòng theo kỳ, sort TĂNG dần; mỗi dòng có `period` + 1 field số/game (khoá = raw `gameProduct`).
   */
  async aggregateByPeriodPerGame(params: {
    from: string;
    to: string;
    period: FinancialPeriod;
    games: readonly string[];
    metric: GamePeriodMetricKey;
  }): Promise<GamePeriodByGameRow[]> {
    const { from, to, period, games, metric } = params;

    const daily = await this.aggregate([
      {
        $match: {
          financialDate: { $gte: from, $lte: to },
          gameProduct: { $in: games },
        },
      },
      // Nhóm theo (ngày, game) — bước gộp kỳ (tuần/tháng) làm ở dưới, cùng lý do `aggregateByPeriod`.
      {
        $group: {
          _id: { financialDate: "$financialDate", gameProduct: "$gameProduct" },
          value: { $sum: `$${metric}` },
        },
      },
      {
        $sort: { "_id.financialDate": 1 },
      },
    ]);

    const buckets = new Map<string, GamePeriodByGameRow>();
    for (const row of daily) {
      const id = row["_id"] as { financialDate: string; gameProduct: string };
      const key = financialPeriodKey(id.financialDate, period);
      const bucket = buckets.get(key);
      const value = row["value"] as number;
      if (bucket === undefined) {
        const initial: GamePeriodByGameRow = { period: key };
        for (const g of games) {
          initial[g] = 0;
        }
        initial[id.gameProduct] = value;
        buckets.set(key, initial);
        continue;
      }
      bucket[id.gameProduct] = ((bucket[id.gameProduct] as number | undefined) ?? 0) + value;
    }

    return [...buckets.values()].toSorted((a, b) => a.period.localeCompare(b.period));
  }

  /**
   * Raw query cho 1 ngày — dùng cho inline expand game breakdown.
   *
   * Query system_settle_game_daily WHERE financialDate = ngày chỉ định.
   * Trả về tất cả docs của ngày đó (1 doc/game).
   * Index: { financialDate: 1 }
   */
  async findByFinancialDate(financialDate: string): Promise<SystemSettleGameDailyEntity[]> {
    return this.findMany({
      financialDate,
    });
  }

  /**
   * Raw query cho nhiều ngày tài chính cụ thể — dùng cho dashboard KPIs.
   *
   * Query system_settle_game_daily WHERE financialDate IN [...dates].
   * Trả về raw docs, client tách theo financialDate để compute KPI totals, trend %.
   * 1 query phục vụ zone KPI + Game Table + Game Mix + Payout Ratio + Trend %.
   * Index: { financialDate: 1, gameProduct: 1 }
   */
  async findByFinancialDates(financialDates: string[]): Promise<DashboardGameDailyData[]> {
    const result = await this.findMany({
      financialDate: { $in: financialDates } as unknown as string,
    });
    return result.map((r) => ({
      gameProduct: r.gameProduct as string,
      financialDate: r.financialDate as string,
      drawCount: r.drawCount as number,
      entryCount: r.entryCount as number,
      playerCount: r.playerCount as number,
      totalStake: r.totalStake as number,
      totalWin: r.totalWin as number,
      totalPayout: r.totalPayout as number,
      ggr: r.ggr as number,
      totalCommission: r.totalCommission as number,
      netProfit: r.netProfit as number,
    }));
  }
}
