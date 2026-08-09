/**
 * Keno – Entry Void Repository
 *
 * Collection: kenoTicketEntries (status = "void" only)
 *
 * Tách riêng khỏi entry-repo.ts vì concern khác nhau:
 * - entry-repo.ts: insert, update, settle, void, financial aggregates (settled)
 * - entry-void-repo.ts: read-only drill-down aggregates (voided)
 *
 * Index đang có và được dùng ở đây:
 *   { drawId: 1, tenantId: 1, accountId: 1 }
 *
 * Tất cả methods là READ-ONLY — không write/update entries.
 */

import { EntryStatus } from "@megawin/game-core/entities";
import type { TicketEntryEntity } from "@megawin/game-keno/entities";
import { KenoCollections } from "@megawin/game-keno/entities";

import { EntryMapper } from "../mappers/entry-mapper";
import { BaseRepo } from "./base-repo";
import type { VoidPlayerBreakdownRow, VoidTenantBreakdownRow } from "./types";

export class EntryVoidRepository extends BaseRepo<TicketEntryEntity, EntryMapper> {
  constructor() {
    super({
      collName: KenoCollections.TicketEntries,
      dataMapper: new EntryMapper(),
    });
  }

  /**
   * Aggregate tenant breakdown cho 1 draw đã void.
   *
   * Double-$group để đếm playerCount chính xác:
   * - Bước 1: group (accountId, tenantId) → dedup accounts per tenant
   * - Bước 2: group tenantId → sum metrics
   *
   * Sort: totalOriginalStake DESC
   *
   * @param drawId - Format `YYYY-MM-DD.NNN`
   */
  async aggregateTenantsByDraw(drawId: string): Promise<VoidTenantBreakdownRow[]> {
    const results = await this.aggregate([
      {
        $match: {
          drawId,
          status: EntryStatus.Void,
        },
      },
      // dedup (accountId, tenantId) → đếm playerCount chính xác
      {
        $group: {
          _id: {
            accountId: "$accountId",
            tenantId: "$tenantId",
          },
          entryCount: { $sum: 1 },
          totalOriginalStake: { $sum: "$amount" },
          totalRefundAmount: { $sum: "$voidInfo.refundAmount" },
        },
      },
      // group by tenantId → aggregate
      {
        $group: {
          _id: "$_id.tenantId",
          playerCount: { $sum: 1 },
          entryCount: { $sum: "$entryCount" },
          totalOriginalStake: { $sum: "$totalOriginalStake" },
          totalRefundAmount: { $sum: "$totalRefundAmount" },
        },
      },
      { $sort: { totalOriginalStake: -1 } },
    ]);

    return results.map((r: any) => ({
      tenantId: r._id as string,
      entryCount: r.entryCount ?? 0,
      playerCount: r.playerCount ?? 0,
      totalOriginalStake: r.totalOriginalStake ?? 0,
      totalRefundAmount: r.totalRefundAmount ?? 0,
    }));
  }

  /**
   * Aggregate player breakdown cho 1 draw × 1 tenant đã void.
   *
   * Group by accountId, giữ username từ doc đầu tiên.
   * Sort: totalOriginalStake DESC
   *
   * @param drawId   - Format `YYYY-MM-DD.NNN`
   * @param tenantId - Tenant filter
   */
  async aggregatePlayersByDrawAndTenant(drawId: string, tenantId: string): Promise<VoidPlayerBreakdownRow[]> {
    const results = await this.aggregate([
      {
        $match: {
          drawId,
          tenantId,
          status: EntryStatus.Void,
        },
      },
      {
        $group: {
          _id: "$accountId",
          username: { $first: "$username" },
          entryCount: { $sum: 1 },
          totalOriginalStake: { $sum: "$amount" },
          totalRefundAmount: { $sum: "$voidInfo.refundAmount" },
        },
      },
      { $sort: { totalOriginalStake: -1 } },
    ]);

    return results.map((r: any) => ({
      accountId: r._id as string,
      username: r.username ?? r._id,
      entryCount: r.entryCount ?? 0,
      totalOriginalStake: r.totalOriginalStake ?? 0,
      totalRefundAmount: r.totalRefundAmount ?? 0,
    }));
  }

  /**
   * Lấy danh sách entries void của 1 player trong 1 draw × tenant.
   *
   * Trả về full entity để dialog có thể hiển thị chi tiết boards.
   * Sort: createdAt DESC (mới nhất trước)
   *
   * @param drawId    - Format `YYYY-MM-DD.NNN`
   * @param tenantId  - Tenant filter
   * @param accountId - Player filter
   */
  async findEntriesByDrawTenantPlayer(
    drawId: string,
    tenantId: string,
    accountId: string,
  ): Promise<TicketEntryEntity[]> {
    return await this.findMany(
      {
        drawId,
        tenantId,
        accountId,
        status: EntryStatus.Void,
      },
      { sort: { createdAt: -1 } },
    );
  }
}
