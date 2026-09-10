/**
 * System Settle Tenant Daily Repository (Base)
 *
 * Ghi và query system-level tenant daily settle reports trong MongoDB.
 * 1 doc = 1 tenant × 1 game × 1 financialDate.
 *
 * Collection: system_settle_tenant_daily
 *
 * Chỉ làm việc với SYSTEM collection:
 *   - upsertTenantDaily          — ghi per-game tenant aggregate vào system (đơn lẻ, không hàng rào)
 *   - bulkUpsertTenantDaily      — ghi N tenant trong 1 DB call, CÓ hàng rào đơn điệu `rollupVersion`
 *   - deleteStaleTenantDaily     — xoá doc tenant không còn trong lô rollup hiện tại (void-after-settle)
 *   - aggregateByTenantId        — query tổng hợp theo tenant
 *   - findTenantGameBreakdown    — query game breakdown cho 1 tenant
 *
 * Per-game aggregate (từ per-game tenant reports → system) nằm ở mỗi game package.
 * Game package thừa kế class này, thêm perGameColl + aggregateAndPublish().
 *
 * IDEMPOTENT: write dùng upsert overwrite trường tiền — chạy lại an toàn.
 * `bulkUpsertTenantDaily` CÓ hàng rào đơn điệu (`rollupVersion`) — xem
 * `SystemPublishSettleDailyUseCase` cho nguồn gốc giá trị này.
 */

import { isOnlyDuplicateKeyError, ReportRepo } from "@megawin/data/mongo";
import type { GameProduct, SystemSettleTenantDaily, SystemSettleTenantDailyEntity } from "@megawin/game-core/entities";
import { SYSTEM_SETTLE_TENANT_DAILY } from "@megawin/game-core/entities";
import { MongoBulkWriteError } from "mongodb";

import { SystemSettleTenantDailyMapper } from "../mappers";
import type { TenantGameBreakdownRow, TenantSummaryRow } from "./types";

/**
 * Base repository ghi và query system tenant daily settle reports.
 *
 * Chỉ làm việc với system_settle_tenant_daily collection.
 * Per-game aggregate logic nằm ở subclass trong mỗi game package.
 */
export class SystemSettleTenantDailyRepository extends ReportRepo<
  SystemSettleTenantDailyEntity,
  SystemSettleTenantDailyMapper
> {
  constructor() {
    super({
      collName: SYSTEM_SETTLE_TENANT_DAILY,
      dataMapper: new SystemSettleTenantDailyMapper(),
    });
  }

  /**
   * Upsert tổng hợp settle của 1 tenant × 1 game trong 1 ngày tài chính.
   *
   * Flatten design: 1 doc = 1 financialDate × 1 tenantId × 1 gameProduct.
   * Filter: { financialDate, tenantId, gameProduct }.
   * IDEMPOTENT: chạy lại an toàn.
   */
  async upsertTenantDaily(report: Omit<SystemSettleTenantDaily, "createdAt" | "updatedAt">): Promise<void> {
    const now = new Date();
    await this.findOneAndUpdate(
      {
        financialDate: report.financialDate,
        tenantId: report.tenantId,
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
   * Bulk upsert nhiều tenant daily reports trong 1 DB call — CÓ hàng rào đơn điệu.
   *
   * `rollupVersion` là `version` của game-daily SAU khi lô này CAS thắng (§3.7 plan
   * p0-01) — nhờ vậy thứ tự tenant-daily luôn nhất quán với game-daily, không cần
   * nguồn version thứ hai.
   *
   * Hàng rào `$lte` (KHÔNG `$eq` như game-daily): chặn ghi từ lô CŨ hơn, nhưng cho
   * phép lô hiện tại ghi lại chính nó → SFN retry cùng lô vẫn idempotent.
   *
   * `ordered: false` là BẮT BUỘC: 1 tenant bị hàng rào chặn không được làm dừng các
   * tenant sau (mặc định `ordered: true` dừng ở lỗi đầu tiên). Với `ordered: false`,
   * MỘT tenant bị E11000 (unique index vướng do hàng rào `rollupVersion` không khớp —
   * cùng nghĩa với "bị hàng rào chặn") không dừng lô, nhưng `bulkWrite` vẫn throw
   * `MongoBulkWriteError` ở cuối cùng — phải bắt và kiểm tra: nếu MỌI writeError đều
   * là 11000 thì coi như "các doc đó bị hàng rào chặn", đọc `modifiedCount + upsertedCount`
   * từ error và trả về, KHÔNG rethrow. Lỗi khác 11000 → rethrow.
   *
   * Noop-safe: `reports` rỗng thì không gọi DB.
   *
   * @param rollupVersion - Bỏ trống = 0 (tương thích caller cũ, không có hàng rào).
   * @returns Số doc thực sự được ghi (`modifiedCount + upsertedCount`) — lệch với
   *   `reports.length` nghĩa là có doc bị hàng rào chặn, caller nên log.
   */
  async bulkUpsertTenantDaily(
    reports: Omit<SystemSettleTenantDaily, "createdAt" | "updatedAt" | "rollupVersion">[],
    rollupVersion = 0,
  ): Promise<number> {
    if (reports.length === 0) {
      return 0;
    }

    const now = new Date();
    // `rollupVersion: { $lte }` predicate thường (KHÔNG `$expr`/`$ifNull`) — giữ index
    // bound trên unique `{ financialDate, tenantId, gameProduct }` rồi so stamp. TIỀN ĐỀ:
    // mọi doc đã tồn tại có field `rollupVersion` (backfill `$exists: false` → `0` trước
    // deploy). Doc thiếu field không khớp `$lte` trong Mongo (thiếu ≠ 0).
    const ops = reports.map((report) => ({
      updateOne: {
        filter: {
          financialDate: report.financialDate,
          tenantId: report.tenantId,
          gameProduct: report.gameProduct,
          rollupVersion: { $lte: rollupVersion },
        },
        update: {
          $set: {
            ...report,
            rollupVersion,
            updatedAt: now,
          },
          $setOnInsert: {
            createdAt: now,
          },
        },
        upsert: true,
      },
    }));

    try {
      const result = await this.bulkWrite(ops, { ordered: false });
      return result.modifiedCount + result.upsertedCount;
    } catch (error) {
      // ordered:false: 1 tenant bị hàng rào chặn (E11000 do rollupVersion không khớp) không
      // dừng lô, nhưng bulkWrite vẫn throw MongoBulkWriteError ở cuối cùng chứa
      // writeErrors[] + result (số doc ĐÃ ghi thành công trước khi lỗi). Nếu mọi
      // writeError đều là 11000 → coi như "bị hàng rào chặn", không phải lỗi thật.
      if (error instanceof MongoBulkWriteError && isOnlyDuplicateKeyError(error)) {
        return error.modifiedCount + error.upsertedCount;
      }
      throw error;
    }
  }

  /**
   * Xoá doc tenant-daily của tenant KHÔNG còn trong lô rollup hiện tại.
   *
   * Void-after-settle xoá hết per-game tenant reports của tenant X → X không còn trong
   * `aggregateTenantsFromPerGame` → doc system của X giữ số cũ vĩnh viễn và báo cáo đại
   * lý vẫn tính hoa hồng cho giao dịch đã void. Method này dọn đúng những doc đó.
   *
   * Filter LUÔN có scope `{ financialDate, gameProduct }` — không bao giờ xoá diện rộng.
   *
   * HÀNG RÀO `rollupVersion` — BẮT BUỘC, cùng lý do với {@link bulkUpsertTenantDaily}:
   * không có nó, một lô CŨ chạy chậm sẽ xoá doc mà lô MỚI vừa ghi. Ví dụ 2 kỳ settle
   * song song cùng ngày: lô A (`rollupVersion = 1`) thấy tenant `[X]`, lô B
   * (`rollupVersion = 2`) thấy `[X, Y]` và ghi cả hai. A chạy chậm hơn, `bulkUpsert` của
   * A bị `$lte` chặn đúng, nhưng `deleteMany` không hàng rào sẽ xoá Y (`$nin: [X]`) →
   * báo cáo đại lý Y mất stake/hoa hồng của ngày đó cho tới lần rollup kế tiếp — nếu đó
   * là kỳ CUỐI ngày thì sai vĩnh viễn.
   *
   * `$lte` (không `$eq`) khớp `bulkUpsertTenantDaily`: cho lô hiện tại dọn lại chính nó
   * (SFN retry cùng lô vẫn idempotent), chỉ chặn lô cũ hơn. Dùng predicate thường
   * `rollupVersion: { $lte }` (KHÔNG `$expr`) — `deleteMany` theo ngày/game là chỗ
   * `$expr` hại index rõ nhất trong 3 write path.
   *
   * TIỀN ĐỀ giống {@link bulkUpsertTenantDaily}: backfill `rollupVersion` trước deploy.
   *
   * @param params.rollupVersion - Stamp của lô hiện tại (từ CAS game-daily đã thắng).
   * @param params.allowEmptyKeep - Chỉ cho phép `keepTenantIds` rỗng khi thật sự không
   *   còn draw nào (`drawCount === 0`). Nếu rỗng mà `false` (có draw nhưng không có
   *   tenant — bất thường) → log error và BỎ QUA xoá, không xoá mò.
   * @returns Số doc đã xoá.
   */
  async deleteStaleTenantDaily(params: {
    financialDate: string;
    gameProduct: GameProduct;
    keepTenantIds: string[];
    allowEmptyKeep: boolean;
    rollupVersion: number;
  }): Promise<number> {
    const { financialDate, gameProduct, keepTenantIds, allowEmptyKeep, rollupVersion } = params;

    // keepTenantIds rỗng làm filter thành { financialDate, gameProduct } — xoá SẠCH
    // tenant của game/ngày đó. Đúng khi đã void hết (allowEmptyKeep = true), nhưng
    // bất thường nếu còn draw mà không có tenant nào → không xoá mò, log để điều tra.
    if (keepTenantIds.length === 0 && !allowEmptyKeep) {
      console.error(
        "[SystemSettleTenantDailyRepository] deleteStaleTenantDaily: keepTenantIds rỗng nhưng " +
          "allowEmptyKeep=false (có draw nhưng không có tenant) — bỏ qua xoá.",
        { financialDate, gameProduct },
      );
      return 0;
    }

    return await this.deleteMany({
      financialDate,
      gameProduct,
      tenantId: { $nin: keepTenantIds },
      // Chỉ dọn doc thuộc lô này hoặc CŨ hơn — không xoá doc lô mới hơn vừa ghi.
      rollupVersion: { $lte: rollupVersion },
    });
  }

  /**
   * Aggregate by tenantId — SUM cross-game cho mỗi tenant trong date range.
   *
   * Query vào system_settle_tenant_daily, group by tenantId.
   * Optional filter theo gameProduct để chỉ lấy data của 1 game.
   * Sort theo totalStake descending. Dùng tab "Theo đại lý".
   * Index: { financialDate: 1, tenantId: 1, gameProduct: 1 }
   */
  async aggregateByTenantId(from: string, to: string, gameProduct?: GameProduct): Promise<TenantSummaryRow[]> {
    const matchStage: Record<string, unknown> = {
      financialDate: {
        $gte: from,
        $lte: to,
      },
    };

    // Filter theo game nếu được chỉ định
    if (gameProduct) {
      matchStage["gameProduct"] = gameProduct;
    }

    const result = await this.aggregate([
      // Lọc theo date range (và game nếu có)
      {
        $match: matchStage,
      },
      // Nhóm theo tenantId → SUM cross-game
      {
        $group: {
          _id: "$tenantId",
          gameCount: { $addToSet: "$gameProduct" },
          drawCount: { $sum: "$drawCount" },
          entryCount: { $sum: "$entryCount" },
          playerCount: { $sum: "$playerCount" },
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
      tenantId: r["_id"] as string,
      gameCount: (r["gameCount"] as string[]).length,
      drawCount: r["drawCount"] as number,
      entryCount: r["entryCount"] as number,
      playerCount: r["playerCount"] as number,
      totalStake: r["totalStake"] as number,
      totalWin: r["totalWin"] as number,
      totalPayout: r["totalPayout"] as number,
      ggr: r["ggr"] as number,
      totalCommission: r["totalCommission"] as number,
      netProfit: r["netProfit"] as number,
    }));
  }

  /**
   * Game breakdown cho 1 tenant trong date range — SUM cross-date per game.
   *
   * Aggregate system_settle_tenant_daily WHERE tenantId + financialDate in range,
   * group by gameProduct → 1 row per game.
   * Sort theo gameProduct ascending.
   * Index: { financialDate: 1, tenantId: 1, gameProduct: 1 }
   */
  async findTenantGameBreakdown(tenantId: string, from: string, to: string): Promise<TenantGameBreakdownRow[]> {
    const result = await this.aggregate([
      // Lọc theo tenant + date range
      {
        $match: {
          tenantId,
          financialDate: {
            $gte: from,
            $lte: to,
          },
        },
      },
      // Nhóm theo gameProduct → SUM cross-date
      {
        $group: {
          _id: "$gameProduct",
          drawCount: { $sum: "$drawCount" },
          entryCount: { $sum: "$entryCount" },
          playerCount: { $sum: "$playerCount" },
          totalStake: { $sum: "$totalStake" },
          totalWin: { $sum: "$totalWin" },
          totalPayout: { $sum: "$totalPayout" },
          ggr: { $sum: "$ggr" },
          commission: { $sum: "$commission" },
          netProfit: { $sum: "$netProfit" },
        },
      },
      // Sắp xếp theo gameProduct ascending
      {
        $sort: {
          _id: 1,
        },
      },
    ]);

    return result.map((r) => ({
      gameProduct: r["_id"] as string,
      drawCount: r["drawCount"] as number,
      entryCount: r["entryCount"] as number,
      playerCount: r["playerCount"] as number,
      totalStake: r["totalStake"] as number,
      totalWin: r["totalWin"] as number,
      totalPayout: r["totalPayout"] as number,
      ggr: r["ggr"] as number,
      commission: r["commission"] as number,
      netProfit: r["netProfit"] as number,
    }));
  }
}
