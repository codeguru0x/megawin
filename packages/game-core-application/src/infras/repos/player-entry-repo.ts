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
import type { PlayerSettledEntryRow } from "./types";

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
   * Entries settled/voided của 1 player trong 1 ngày × 1 game.
   *
   * Drill cấp 2 từ bảng tài chính Player Detail.
   * Filter: { accountId, financialDate, status ∈ [settled, void] }.
   * Sort: createdAt desc (entry mới nhất trước).
   *
   * Index cần: { accountId: 1, financialDate: 1 } trên mỗi {game}_ticket_entries.
   * 1 player = 1 tenant → không cần tenantId filter.
   */
  async getPlayerEntriesByDateAndGame(
    accountId: string,
    financialDate: string,
    gameProduct: GameProduct,
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
        },
        {
          // Project summary fields — đủ để hiển thị bảng entries
          projection: {
            _id: 1,
            ticketId: 1,
            "entrySummary.ticketNo": 1,
            drawId: 1,
            "tenant.tenantId": 1,
            status: 1,
            outcome: 1,
            amount: 1,
            // lineCount hoặc selectionCount — tùy game
            lineCount: 1,
            selectionCount: 1,
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
      const lineCount =
        (doc.lineCount as number | undefined) ?? (doc.selectionCount as number | undefined) ?? 0;

      return {
        entryId: String(doc._id),
        ticketId: (doc.ticketId as string) ?? "",
        ticketNo: (entrySummary?.ticketNo as string) ?? "",
        drawId: (doc.drawId as string) ?? "",
        tenantId: (tenant?.tenantId as string) ?? "",
        status: (doc.status as string) ?? "",
        outcome: (doc.outcome as string | null | undefined) ?? null,
        amount: (doc.amount as number) ?? 0,
        lineCount,
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
}
