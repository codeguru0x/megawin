/**
 * Keno – Draw Repository
 *
 * Collection: kenoDraws
 *
 * Quản lý trạng thái kỳ mở thưởng Keno.
 * Tất cả status transitions phải đi qua transitionStatus() để đảm bảo atomic.
 */

import { KenoCollections } from "@megawin/game-keno/entities";
import { DrawStatus } from "@megawin/game-core/entities";
import { BaseRepo } from "./base-repo";
import { DrawMapper, type DrawEntity } from "../mappers/draw-mapper";

/**
 * Valid status transitions cho Keno Draw.
 *
 * Flow: scheduled → salesOpen ⇄ salesClosed → published → settling → settled
 *          ↘ void      ↘ void      ↘ void       ↘ void
 */
const VALID_TRANSITIONS: Record<string, Set<string>> = {
  [DrawStatus.Scheduled]: new Set([DrawStatus.SalesOpen, DrawStatus.Void]),
  [DrawStatus.SalesOpen]: new Set([DrawStatus.SalesClosed, DrawStatus.Void]),
  [DrawStatus.SalesClosed]: new Set([DrawStatus.SalesOpen, DrawStatus.Published, DrawStatus.Void]),
  [DrawStatus.Published]: new Set([DrawStatus.Settling, DrawStatus.Void]),
  [DrawStatus.Settling]: new Set([DrawStatus.Settled]),
};

export class DrawRepository extends BaseRepo<DrawEntity, DrawMapper> {
  constructor() {
    super({
      collName: KenoCollections.Draws,
      dataMapper: new DrawMapper(),
    });
  }

  /** Tìm draw theo drawId. */
  async getDrawById(drawId: string): Promise<DrawEntity | null> {
    return await this.findOne({ drawId });
  }

  /** Lấy draw đang mở bán gần nhất (theo thời gian). */
  async getNextOpenDraw(): Promise<DrawEntity | null> {
    return await this.findOne(
      { status: DrawStatus.SalesOpen },
      { sort: { drawTime: 1 } },
    );
  }

  /** Lấy tất cả draws trong 1 ngày. */
  async getDrawsByDate(drawDate: string): Promise<DrawEntity[]> {
    return await this.findMany(
      { drawDate },
      { sort: { drawNo: 1 } },
    );
  }

  /**
   * Atomic status transition với guard.
   * Kiểm tra transition hợp lệ trước khi update.
   *
   * @param extraSet - Thêm fields vào $set (vd: voidInfo khi void).
   * @returns true nếu update thành công.
   */
  async transitionStatus(
    drawId: string,
    fromStatus: string,
    toStatus: string,
    extraSet?: Record<string, unknown>,
  ): Promise<boolean> {
    const allowed = VALID_TRANSITIONS[fromStatus];
    if (!allowed?.has(toStatus)) return false;

    const $set: Record<string, unknown> = {
      status: toStatus,
      updatedAt: new Date(),
      ...extraSet,
    };

    return await this.updateOne(
      { drawId, status: fromStatus },
      { $set },
    );
  }

  /** Ghi financial data sau khi settle xong. */
  async updateFinancial(drawId: string, financial: Record<string, unknown>): Promise<boolean> {
    return await this.updateOne(
      { drawId },
      { $set: { financial, updatedAt: new Date() } },
    );
  }

  /** Ghi stats (entryCount, totalSalesAmount) sau khi close sales. */
  async updateStats(drawId: string, stats: Record<string, unknown>): Promise<boolean> {
    return await this.updateOne(
      { drawId },
      { $set: { stats, updatedAt: new Date() } },
    );
  }

  /**
   * Ghi tổng kết void lên draw document sau khi void flow hoàn tất.
   * Ghi đè voidSummary – idempotent.
   */
  async updateVoidSummary(
    drawId: string,
    summary: {
      totalVoidedEntries: number;
      totalOriginalAmount: number;
      totalRefundAmount: number;
      completedAt: Date;
    },
  ): Promise<boolean> {
    return await this.updateOne(
      { drawId },
      { $set: { voidSummary: summary, updatedAt: new Date() } },
    );
  }
}

export { VALID_TRANSITIONS };
