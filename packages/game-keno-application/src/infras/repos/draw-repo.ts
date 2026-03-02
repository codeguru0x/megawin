/**
 * Keno – Draw Repository
 *
 * Collection: kenoDraws
 *
 * Quản lý trạng thái kỳ mở thưởng Keno.
 * Tất cả status transitions phải đi qua repo methods để đảm bảo atomic + type-safe.
 *
 * RULE: Use case KHÔNG BAO GIỜ dùng dot notation hay biết cấu trúc MongoDB.
 *       Mọi field update đi qua typed method ở đây.
 *       Khi entity đổi field → chỉ sửa repo, compiler sẽ bắt lỗi ở use case.
 */

import { KenoCollections } from "@megawin/game-keno/entities";
import { DrawStatus } from "@megawin/game-core/entities";
import type { DrawDoc } from "@megawin/game-keno/entities";
import { BaseRepo } from "./base-repo";
import { DrawMapper, type DrawEntity } from "../mappers/draw-mapper";

/**
 * Valid status transitions cho Keno Draw.
 *
 * Flow: scheduled → salesOpen → salesClosed → published → settling → settled
 *          ↘ void        ↑↓         ↘ void       ↘ void
 */
const VALID_TRANSITIONS: Record<string, Set<string>> = {
  [DrawStatus.Scheduled]: new Set([DrawStatus.SalesOpen, DrawStatus.Void]),
  [DrawStatus.SalesOpen]: new Set([DrawStatus.SalesClosed]),
  [DrawStatus.SalesClosed]: new Set([
    DrawStatus.SalesOpen,
    DrawStatus.Published,
    DrawStatus.Void,
  ]),
  [DrawStatus.Published]: new Set([DrawStatus.Settling, DrawStatus.Void]),
  [DrawStatus.Settling]: new Set([DrawStatus.Settled]),
};

// ─────────────────────────────────────────────
// Typed extra-set payloads cho transition
// ─────────────────────────────────────────────

export interface VoidInfo {
  reason: string;
  voidedBy?: string;
  voidedAt: Date;
}

export class DrawRepository extends BaseRepo<DrawEntity, DrawMapper> {
  constructor() {
    super({
      collName: KenoCollections.Draws,
      dataMapper: new DrawMapper(),
    });
  }

  // ─── CRUD ───

  async createDraw(doc: Omit<DrawDoc, "_id">): Promise<string> {
    return await this.insertOne(doc as any);
  }

  async getDrawById(drawId: string): Promise<DrawEntity | null> {
    return await this.findOne({ drawId });
  }

  async getNextOpenDraw(): Promise<DrawEntity | null> {
    return await this.findOne(
      { status: DrawStatus.SalesOpen },
      { sort: { drawTime: 1 } }
    );
  }

  async getDrawsByIds(drawIds: string[]): Promise<DrawEntity[]> {
    return await this.findMany(
      { drawId: { $in: drawIds } },
      { sort: { drawDate: 1, drawNo: 1 } }
    );
  }

  async getDrawsByDate(drawDate: string): Promise<DrawEntity[]> {
    return await this.findMany({ drawDate }, { sort: { drawNo: 1 } });
  }

  async listDraws(
    filter: { status?: string; fromDate?: string; toDate?: string },
    page: number,
    size: number
  ): Promise<DrawEntity[]> {
    const query: Record<string, unknown> = {};
    if (filter.status) query.status = filter.status;
    if (filter.fromDate || filter.toDate) {
      const dateRange: Record<string, unknown> = {};
      if (filter.fromDate) dateRange.$gte = filter.fromDate;
      if (filter.toDate) dateRange.$lte = filter.toDate;
      query.drawDate = dateRange;
    }
    return await this.paging(query, page, size, {
      sort: { drawDate: -1, drawNo: -1 },
    });
  }

  async getLatestDraw(): Promise<DrawEntity | null> {
    return await this.findOne({}, { sort: { drawDate: -1, drawNo: -1 } });
  }

  async getCurrentDraw(allowStatuses?: string[]): Promise<DrawEntity | null> {
    const statuses = allowStatuses ?? [DrawStatus.SalesOpen];
    return await this.findOne(
      { status: { $in: statuses } },
      { sort: { drawDate: 1, drawNo: 1 } }
    );
  }

  async getActiveDraws(allowStatuses: string[]): Promise<DrawEntity[]> {
    return await this.findMany(
      { status: { $in: allowStatuses } },
      { sort: { drawDate: 1, drawNo: 1 } }
    );
  }

  // ─── Status Transitions (atomic, type-safe) ───

  /**
   * Atomic status transition cơ bản (không kèm extra data).
   * Trả về entity sau update hoặc null nếu transition invalid.
   */
  async transitionStatus(
    drawId: string,
    fromStatus: string,
    toStatus: string
  ): Promise<DrawEntity | null> {
    const allowed = VALID_TRANSITIONS[fromStatus];
    if (!allowed?.has(toStatus)) return null;

    return await this.findOneAndUpdate(
      { drawId, status: fromStatus },
      { $set: { status: toStatus, updatedAt: new Date() } },
      { returnDocument: "after" }
    );
  }

  /**
   * Open sales: scheduled/salesClosed → salesOpen.
   * Stamp sales.openAt nếu lần đầu mở bán.
   */
  async openSales(
    drawId: string,
    fromStatus: string,
    salesOpenAt?: Date
  ): Promise<DrawEntity | null> {
    const allowed = VALID_TRANSITIONS[fromStatus];
    if (!allowed?.has(DrawStatus.SalesOpen)) return null;

    const $set: Record<string, unknown> = {
      status: DrawStatus.SalesOpen,
      updatedAt: new Date(),
    };
    if (salesOpenAt) {
      $set["sales.openAt"] = salesOpenAt;
    }

    return await this.findOneAndUpdate(
      { drawId, status: fromStatus },
      { $set },
      { returnDocument: "after" }
    );
  }

  /**
   * Close sales: salesOpen → salesClosed.
   * Stamp sales.closeAt thời điểm đóng bán thực tế.
   */
  async closeSales(
    drawId: string,
    salesCloseAt?: Date
  ): Promise<DrawEntity | null> {
    const allowed = VALID_TRANSITIONS[DrawStatus.SalesOpen];
    if (!allowed?.has(DrawStatus.SalesClosed)) return null;

    const $set: Record<string, unknown> = {
      status: DrawStatus.SalesClosed,
      updatedAt: new Date(),
    };
    if (salesCloseAt) {
      $set["sales.closeAt"] = salesCloseAt;
    }

    return await this.findOneAndUpdate(
      { drawId, status: DrawStatus.SalesOpen },
      { $set },
      { returnDocument: "after" }
    );
  }

  /**
   * Void draw: transition → void + ghi voidInfo embedded doc.
   */
  async voidDraw(
    drawId: string,
    fromStatus: string,
    voidInfo: VoidInfo
  ): Promise<DrawEntity | null> {
    const allowed = VALID_TRANSITIONS[fromStatus];
    if (!allowed?.has(DrawStatus.Void)) return null;

    return await this.findOneAndUpdate(
      { drawId, status: fromStatus },
      {
        $set: {
          status: DrawStatus.Void,
          voidInfo,
          updatedAt: new Date(),
        },
      },
      { returnDocument: "after" }
    );
  }

  /**
   * Publish kết quả: salesClosed → published + ghi result + vietlottRef.
   */
  async publishResult(
    drawId: string,
    result: {
      winningNumbers: number[];
      bigCount: number;
      smallCount: number;
      evenCount: number;
      oddCount: number;
    },
    vietlottRef?: DrawDoc["vietlottRef"]
  ): Promise<DrawEntity | null> {
    const now = new Date();
    const $set: Record<string, unknown> = {
      status: DrawStatus.Published,
      result: { ...result, publishedAt: now },
      updatedAt: now,
    };
    if (vietlottRef) $set.vietlottRef = vietlottRef;

    const allowed = VALID_TRANSITIONS[DrawStatus.SalesClosed];
    if (!allowed?.has(DrawStatus.Published)) return null;

    return await this.findOneAndUpdate(
      { drawId, status: DrawStatus.SalesClosed },
      { $set },
      { returnDocument: "after" }
    );
  }

  /**
   * Sửa kết quả khi draw đã published (chưa settle).
   * Chỉ ghi đè result, không chuyển status.
   */
  async updateResult(
    drawId: string,
    result: {
      winningNumbers: number[];
      bigCount: number;
      smallCount: number;
      evenCount: number;
      oddCount: number;
      publishedAt: Date;
    },
    vietlottRef?: DrawDoc["vietlottRef"]
  ): Promise<boolean> {
    const $set: Record<string, unknown> = {
      result,
      updatedAt: new Date(),
    };
    if (vietlottRef) $set.vietlottRef = vietlottRef;

    return await this.updateOne(
      { drawId, status: DrawStatus.Published },
      { $set }
    );
  }

  // ─── Data Updates (type-safe) ───

  async updateSchedule(
    drawId: string,
    sales: { openAt: Date; closeAt: Date; drawTime?: Date }
  ): Promise<boolean> {
    const $set: Record<string, unknown> = {
      "sales.openAt": sales.openAt,
      "sales.closeAt": sales.closeAt,
      updatedAt: new Date(),
    };
    if (sales.drawTime) {
      $set.drawTime = sales.drawTime;
    }
    return await this.updateOne({ drawId }, { $set });
  }

  async updateFinancial(
    drawId: string,
    financial: NonNullable<DrawDoc["financial"]>
  ): Promise<boolean> {
    return await this.updateOne(
      { drawId },
      { $set: { financial, updatedAt: new Date() } }
    );
  }

  async updateStats(
    drawId: string,
    stats: NonNullable<DrawDoc["stats"]>
  ): Promise<boolean> {
    return await this.updateOne(
      { drawId },
      { $set: { stats, updatedAt: new Date() } }
    );
  }

  async updateVoidSummary(
    drawId: string,
    summary: {
      totalVoidedEntries: number;
      totalOriginalAmount: number;
      totalRefundAmount: number;
      completedAt: Date;
    }
  ): Promise<boolean> {
    return await this.updateOne(
      { drawId },
      { $set: { voidSummary: summary, updatedAt: new Date() } }
    );
  }
}

export { VALID_TRANSITIONS };
