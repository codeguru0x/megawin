/**
 * Player Outstanding Repository — query on-demand entries đang chờ của 1 player.
 *
 * Query song song 7 collections ticket_entries (mỗi game 1 collection).
 * Filter: { accountId, status: "scheduled" } — chỉ lấy entries chưa settle/void.
 * Index cần: { accountId: 1, status: 1 } trên mỗi {game}_ticket_entries.
 *
 * Không pre-compute, không TTL — dữ liệu realtime mỗi lần query.
 * Dùng cho tab "Đang chờ" trong trang Player Detail.
 */

import { GameProduct } from "@megawin/game-core/entities/game-core.enums";

import { GameCoreBaseRepo } from "./game-core-base-repo";
import type { PlayerOutstandingEntry, PlayerOutstandingSummary } from "./types";

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

export class PlayerOutstandingRepository extends GameCoreBaseRepo<any> {
  constructor() {
    // Dummy collection — repo dùng getDb() để truy cập 7 collections trực tiếp
    super({ collName: "_player_outstanding_dummy" });
  }

  /**
   * Query song song 7 game collections, lấy tất cả entries scheduled của 1 player.
   *
   * Mỗi game: find({ accountId, status: "scheduled" }), project chỉ fields cần hiển thị.
   * Merge kết quả → sort by createdAt desc → tính summary KPIs.
   *
   * Index: { accountId: 1, status: 1 } trên mỗi {game}_ticket_entries.
   * Limit: tối đa 200 entries (phòng trường hợp player có quá nhiều outstanding).
   */
  async getPlayerOutstanding(accountId: string): Promise<PlayerOutstandingSummary> {
    const db = await this.getDb();

    // Query song song 7 collections — mỗi collection 1 promise
    const queries = Object.entries(ENTRY_COLLECTIONS).map(async ([gameProduct, collName]) => {
      const coll = db.collection(collName);
      const docs = await coll
        .find(
          {
            accountId,
            status: "scheduled",
          },
          {
            // Project fields cần thiết — giảm network transfer.
            // _id để lấy entryId, ticketId + tenantId cho drill-down dialog.
            // entrySummary.ticketNo để hiển thị mã vé (dùng thay ticketId.slice(-8)).
            projection: {
              _id: 1,
              ticketId: 1,
              "entrySummary.ticketNo": 1,
              // boards để tính boardCount
              "entrySummary.boards": 1,
              drawId: 1,
              financialDate: 1,
              amount: 1,
              "tenant.tenantId": 1,
              "tenant.commissionAmount": 1,
              // lineCount/selectionCount tùy game
              lineCount: 1,
              selectionCount: 1,
              // betUnitCount tổng số đơn vị cược
              betUnitCount: 1,
              createdAt: 1,
            },
            sort: { createdAt: -1 },
            limit: 200,
          },
        )
        .toArray();

      return docs.map(
        (doc): PlayerOutstandingEntry => ({
          gameProduct: gameProduct as GameProduct,
          // _id là ObjectId — convert sang hex string để dùng làm entryId
          entryId: String(doc._id),
          ticketId: (doc.ticketId as string) ?? "",
          ticketNo: (doc.entrySummary?.ticketNo as string) ?? "",
          tenantId: (doc.tenant?.tenantId as string) ?? "",
          drawId: doc.drawId as string,
          financialDate: (doc.financialDate as string) ?? "",
          amount: (doc.amount as number) ?? 0,
          // commissionAmount nằm trong embedded object tenant
          commissionAmount: (doc.tenant?.commissionAmount as number) ?? 0,
          // boardCount từ số boards trong entrySummary
          boardCount: Array.isArray(doc.entrySummary?.boards)
            ? (doc.entrySummary.boards as unknown[]).length
            : undefined,
          // lineCount: games có lines; undefined → keno/bingo18
          lineCount: (doc.lineCount as number | undefined) ?? (doc.selectionCount as number | undefined),
          betUnitCount: doc.betUnitCount as number | undefined,
          createdAt: doc.createdAt ? new Date(doc.createdAt as Date).toISOString() : "",
        }),
      );
    });

    // Đợi tất cả 7 queries hoàn thành
    const results = await Promise.all(queries);
    const allEntries = results.flat();

    // Sort tổng hợp by createdAt desc (mới nhất trước)
    allEntries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    // Tính summary KPIs
    let totalStake = 0;
    let totalCommission = 0;
    const activeGames = new Set<string>();

    for (const entry of allEntries) {
      totalStake += entry.amount;
      totalCommission += entry.commissionAmount;
      activeGames.add(entry.gameProduct);
    }

    return {
      totalEntryCount: allEntries.length,
      totalStake,
      totalCommission,
      activeGameCount: activeGames.size,
      entries: allEntries,
    };
  }
}
