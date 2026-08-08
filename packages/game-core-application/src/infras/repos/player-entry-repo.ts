/**
 * Player Entry Repository — query entries của 1 player để drill-down trong Player Detail.
 *
 * Dùng cho 2 luồng:
 * 1. Tab "Tài chính" drill cấp 2: xem entries settled/voided trong 1 ngày × 1 game.
 * 2. Tab "Đang chờ" drill cấp 3: lấy full entry doc cho EntryDetailDialog.
 *
 * 1 player = 1 tenant duy nhất — không cần scope bởi tenantId khi query.
 * Query trực tiếp {game}_ticket_entries collection tương ứng với gameProduct.
 */

import { ObjectId } from "mongodb";
import { GameProduct } from "@megawin/game-core/entities/game-core.enums";
import { GameCoreBaseRepo } from "./game-core-base-repo";
import type { PlayerSettledEntryRow, PlayerDrawBreakdownRow } from "./types";

/** Map gameProduct → tên collection ticket_entries tương ứng. */
const ENTRY_COLLECTIONS: Record<GameProduct, string> = {
  [GameProduct.Mega645]: "mega645_ticket_entries",
  [GameProduct.Power655]: "power655_ticket_entries",
  [GameProduct.Lotto535]: "lotto535_ticket_entries",
  [GameProduct.Keno]: "keno_ticket_entries",
  [GameProduct.Max3d]: "max3d_ticket_entries",
  [GameProduct.Max3dpro]: "max3dpro_ticket_entries",
  [GameProduct.Bingo18]: "bingo18_ticket_entries",
};

export class PlayerEntryRepository extends GameCoreBaseRepo<any> {
  constructor() {
    // Dummy collection — repo dùng getDb() để truy cập đúng collection theo gameProduct
    super({ collName: "_player_entry_dummy" });
  }

  /**
   * Entries settled/voided của 1 player trong 1 ngày × 1 game, optional filter theo drawId.
   *
   * Drill cấp 2/4 từ bảng tài chính Player Detail.
   * Filter: { accountId, financialDate, status ∈ [settled, void], drawId? }.
   * Sort: createdAt desc (entry mới nhất trước).
   *
   * Index cần: { accountId: 1, financialDate: 1 } trên mỗi {game}_ticket_entries.
   * 1 player = 1 tenant → không cần tenantId filter.
   */
  async getPlayerEntriesByDateAndGame(
    accountId: string,
    financialDate: string,
    gameProduct: GameProduct,
    drawId?: string,
  ): Promise<PlayerSettledEntryRow[]> {
    const collName = ENTRY_COLLECTIONS[gameProduct];
    if (!collName) return [];

    const db = await this.getDb();
    const coll = db.collection(collName);

    const docs = await coll
      .find(
        {
          accountId,
          financialDate,
          // Chỉ lấy entries đã có kết quả — settled hoặc void
          status: { $in: ["settled", "void"] },
          // Optional filter theo drawId (View 4 khi drill từ 1 kỳ quay cụ thể)
          ...(drawId ? { drawId } : {}),
        },
        {
          // Project summary fields — đủ để hiển thị bảng entries
          projection: {
            _id: 1,
            ticketId: 1,
            "entrySummary.ticketNo": 1,
            // boardCount = số boards trong entry
            "entrySummary.boards": 1,
            drawId: 1,
            "tenant.tenantId": 1,
            status: 1,
            outcome: 1,
            amount: 1,
            // lineCount hoặc selectionCount — tùy game
            lineCount: 1,
            selectionCount: 1,
            // betUnitCount = tổng số đơn vị cược
            betUnitCount: 1,
            "tenant.commissionAmount": 1,
            // payout chỉ có khi win
            "payout.winAmount": 1,
            "payout.payoutAmount": 1,
            "payout.settledAt": 1,
            createdAt: 1,
          },
          sort: { createdAt: -1 },
        },
      )
      .toArray();

    return docs.map((doc): PlayerSettledEntryRow => {
      const payout = doc.payout as Record<string, unknown> | undefined;
      const tenant = doc.tenant as Record<string, unknown> | undefined;
      const entrySummary = doc.entrySummary as Record<string, unknown> | undefined;

      // lineCount: dùng lineCount nếu có (games có lines), ngược lại dùng selectionCount (keno, bingo18)
      const lineCount = (doc.lineCount as number | undefined) ?? (doc.selectionCount as number | undefined) ?? 0;

      // boardCount = số boards trong entrySummary
      const boards = entrySummary?.boards as unknown[] | undefined;
      const boardCount = boards?.length;

      return {
        entryId: String(doc._id),
        ticketId: (doc.ticketId as string) ?? "",
        ticketNo: (entrySummary?.ticketNo as string) ?? "",
        drawId: (doc.drawId as string) ?? "",
        tenantId: (tenant?.tenantId as string) ?? "",
        status: (doc.status as string) ?? "",
        outcome: (doc.outcome as string | null | undefined) ?? null,
        amount: (doc.amount as number) ?? 0,
        boardCount,
        lineCount,
        betUnitCount: doc.betUnitCount as number | undefined,
        commissionAmount: (tenant?.commissionAmount as number) ?? 0,
        winAmount: (payout?.winAmount as number) ?? 0,
        payoutAmount: (payout?.payoutAmount as number) ?? 0,
        createdAt: doc.createdAt ? new Date(doc.createdAt as Date).toISOString() : "",
        settledAt: payout?.settledAt ? new Date(payout.settledAt as Date).toISOString() : null,
      };
    });
  }

  /**
   * Lấy full entry doc từ {game}_ticket_entries theo entryId (ObjectId hex string).
   *
   * Dùng khi click entry outstanding hoặc financial entry → mở EntryDetailDialog.
   * Return raw doc (unknown) — consumer cast sang game-specific TicketEntryEntity.
   *
   * Outstanding entries (scheduled): không có payout/result/outcome — chỉ có
   * entrySummary, amount, drawId, financialDate, tenant, createdAt.
   * Settled/voided entries: có payout (nếu win), result, outcome, voidInfo.
   */
  async getEntryById(gameProduct: GameProduct, entryId: string): Promise<unknown | null> {
    const collName = ENTRY_COLLECTIONS[gameProduct];
    if (!collName) return null;

    let objectId: ObjectId;
    try {
      objectId = new ObjectId(entryId);
    } catch {
      return null;
    }

    const db = await this.getDb();
    const coll = db.collection(collName);

    const doc = await coll.findOne({ _id: objectId });
    if (!doc) return null;

    // Map _id → id (string) để match TicketEntryEntity convention
    const { _id, ...rest } = doc;
    return { id: String(_id), ...rest };
  }

  /**
   * Aggregate entries theo drawId cho View 3: breakdown kỳ quay trong 1 ngày × 1 game × 1 player.
   *
   * Pipeline: $match { accountId, financialDate, game, status ∈ [settled, void] }
   *           → $group by drawId → compute financial metrics.
   *
   * Financial fields (totalStake, totalPayout, totalCommission) chỉ tính entries settled.
   * entryCount đếm cả settled + void.
   * Sort: drawId asc.
   */
  async aggregatePlayerDrawsInDay(
    accountId: string,
    financialDate: string,
    gameProduct: GameProduct,
  ): Promise<PlayerDrawBreakdownRow[]> {
    const collName = ENTRY_COLLECTIONS[gameProduct];
    if (!collName) return [];

    const db = await this.getDb();
    const coll = db.collection(collName);

    const pipeline = [
      {
        $match: {
          accountId,
          financialDate,
          status: { $in: ["settled", "void"] },
        },
      },
      {
        $group: {
          _id: "$drawId",
          entryCount: { $sum: 1 },
          // Financial chỉ tính settled (status = "settled"), bỏ void
          totalStake: {
            $sum: { $cond: [{ $eq: ["$status", "settled"] }, "$amount", 0] },
          },
          totalPayout: {
            $sum: {
              $cond: [{ $eq: ["$status", "settled"] }, { $ifNull: ["$payout.payoutAmount", 0] }, 0],
            },
          },
          totalCommission: {
            $sum: {
              $cond: [{ $eq: ["$status", "settled"] }, { $ifNull: ["$tenant.commissionAmount", 0] }, 0],
            },
          },
        },
      },
      { $sort: { _id: 1 as const } },
    ];

    const results = await coll.aggregate(pipeline).toArray();

    return results.map((r): PlayerDrawBreakdownRow => {
      const totalStake = (r["totalStake"] as number) ?? 0;
      const totalPayout = (r["totalPayout"] as number) ?? 0;
      const totalCommission = (r["totalCommission"] as number) ?? 0;
      const ggr = totalStake - totalPayout;
      return {
        drawId: (r["_id"] as string) ?? "",
        entryCount: (r["entryCount"] as number) ?? 0,
        totalStake,
        totalPayout,
        ggr,
        totalCommission,
        netProfit: ggr - totalCommission,
      };
    });
  }
}
