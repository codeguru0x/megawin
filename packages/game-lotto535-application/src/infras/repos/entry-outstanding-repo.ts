/**
 * Lotto 5/35 – Entry Outstanding Repository
 *
 * Collection: lotto535TicketEntries (status = "scheduled" only)
 *
 * Tách riêng khỏi entry-repo.ts vì concern khác nhau:
 * - entry-repo.ts: insert, update, settle, void, financial aggregates (settled)
 * - entry-outstanding-repo.ts: read-only drill-down aggregates (scheduled)
 *
 * Index đang có và được dùng ở đây:
 *   { drawId: 1, "tenant.tenantId": 1, accountId: 1 }
 *
 * Tất cả methods là READ-ONLY — không write/update entries.
 */

import { Lotto535Collections } from "@megawin/game-lotto535/entities";
import { EntryStatus } from "@megawin/game-core/entities";
import type { TicketEntryEntity } from "@megawin/game-lotto535/entities";
import { BaseRepo } from "./base-repo";
import { EntryMapper } from "../mappers/entry-mapper";
import type { OutstandingTenantBreakdownRow, OutstandingPlayerBreakdownRow } from "./types";

export class EntryOutstandingRepository extends BaseRepo<TicketEntryEntity, EntryMapper> {
  constructor() {
    super({
      collName: Lotto535Collections.TicketEntries,
      dataMapper: new EntryMapper(),
    });
  }

  /**
   * Aggregate tenant breakdown cho 1 draw outstanding.
   *
   * Double-$group để đếm playerCount chính xác:
   * - Bước 1: group (accountId, tenantId) → dedup accounts per tenant
   * - Bước 2: group tenantId → sum metrics
   *
   * Lotto 5/35 dùng "tenant.tenantId" (dot notation) — khác Power655 dùng top-level tenantId.
   * Index: { drawId: 1, "tenant.tenantId": 1, accountId: 1 }
   * Sort: totalStake DESC
   *
   * @param drawId - Format `YYYY-MM-DD.NNN`
   */
  async aggregateTenantsByDraw(drawId: string): Promise<OutstandingTenantBreakdownRow[]> {
    const col = await this.getCollection();

    const results = (await col
      .aggregate([
        // ── Bước 1: chỉ lấy entries chưa settle ───────────────────────────
        {
          $match: {
            drawId,
            status: EntryStatus.Scheduled,
          },
        },
        // ── Bước 2: group mức (accountId, tenantId) → dedup players ───────
        // Lotto 5/35 dùng tenantId top-level (denormalized), không dùng "tenant.tenantId"
        {
          $group: {
            _id: {
              accountId: "$accountId",
              tenantId: "$tenantId",
            },
            entryCount: { $sum: 1 },
            lineCount: { $sum: "$lineCount" },
            totalStake: { $sum: "$amount" },
            estimatedCommission: { $sum: "$tenant.commissionAmount" },
          },
        },
        // ── Bước 3: group tenantId → đếm players unique ───────────────────
        {
          $group: {
            _id: "$_id.tenantId",
            playerCount: { $sum: 1 },
            entryCount: { $sum: "$entryCount" },
            lineCount: { $sum: "$lineCount" },
            totalStake: { $sum: "$totalStake" },
            estimatedCommission: { $sum: "$estimatedCommission" },
          },
        },
        // ── Bước 4: sort mức doanh thu cao nhất trước ─────────────────────
        { $sort: { totalStake: -1 } },
      ])
      .toArray()) as any[];

    return results.map((r) => ({
      tenantId: r._id as string,
      entryCount: r.entryCount ?? 0,
      playerCount: r.playerCount ?? 0,
      lineCount: r.lineCount ?? 0,
      totalStake: r.totalStake ?? 0,
      estimatedCommission: r.estimatedCommission ?? 0,
    }));
  }

  /**
   * Aggregate player breakdown cho 1 draw × 1 tenant outstanding.
   *
   * Group by accountId, giữ username từ doc đầu tiên của mỗi account.
   * Lotto 5/35 dùng "tenant.tenantId" (dot notation) thay top-level tenantId.
   * Index: { drawId: 1, "tenant.tenantId": 1, accountId: 1 }
   * Sort: totalStake DESC
   *
   * @param drawId   - Format `YYYY-MM-DD.NNN`
   * @param tenantId - Tenant filter
   */
  async aggregatePlayersByDrawAndTenant(drawId: string, tenantId: string): Promise<OutstandingPlayerBreakdownRow[]> {
    const col = await this.getCollection();

    const results = (await col
      .aggregate([
        // ── Bước 1: filter draw × tenant × scheduled ──────────────────────
        // Lotto 5/35 dùng tenantId top-level (denormalized), không dùng "tenant.tenantId"
        {
          $match: {
            drawId,
            tenantId,
            status: EntryStatus.Scheduled,
          },
        },
        // ── Bước 2: group by accountId ────────────────────────────────────
        {
          $group: {
            _id: "$accountId",
            // username — lấy từ doc đầu tiên (snapshot lúc place-bet, đồng nhất)
            username: { $first: "$username" },
            entryCount: { $sum: 1 },
            lineCount: { $sum: "$lineCount" },
            totalStake: { $sum: "$amount" },
            commissionAmount: { $sum: "$tenant.commissionAmount" },
          },
        },
        // ── Bước 3: sort mức doanh thu cao nhất trước ─────────────────────
        { $sort: { totalStake: -1 } },
      ])
      .toArray()) as any[];

    return results.map((r) => ({
      accountId: r._id as string,
      username: r.username ?? r._id,
      entryCount: r.entryCount ?? 0,
      lineCount: r.lineCount ?? 0,
      totalStake: r.totalStake ?? 0,
      commissionAmount: r.commissionAmount ?? 0,
    }));
  }

  /**
   * Lấy danh sách entries outstanding của 1 player trong 1 draw × tenant.
   *
   * Trả về full entity để dialog có thể hiển thị chi tiết boards.
   * Lotto 5/35 dùng "tenant.tenantId" (dot notation).
   * Index: { drawId: 1, "tenant.tenantId": 1, accountId: 1 }
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
    // Lotto 5/35 dùng tenantId top-level (denormalized), không dùng "tenant.tenantId"
    return await this.findMany(
      {
        drawId,
        tenantId,
        accountId,
        status: EntryStatus.Scheduled,
      },
      { sort: { createdAt: -1 } },
    );
  }
}
