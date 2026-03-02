/**
 * Power 6/55 – Draw Repository
 *
 * Collection: power655Draws
 *
 * Quản lý toàn bộ lifecycle kỳ quay Power 6/55:
 *   scheduled → salesOpen ⇄ salesClosed → published → settling → settled
 *      ↘ void      ↘ void      ↘ void       ↘ void
 *
 * Khác biệt so với Lotto 5/35:
 *   - Kết quả: 6 số chính (winningMain: MainTuple) + bonusNumber (thay vì winningSpecial)
 *   - Jackpot kép: openingJackpot1/closingJackpot1 + openingJackpot2/closingJackpot2
 *   - Financial: jackpot1Contribution + jackpot2Contribution + jp1Overflow
 */

import { Power655Collections } from "@megawin/game-power655/entities";
import { DrawStatus } from "@megawin/game-core/entities";
import type {
  DrawDoc,
  DrawSplit,
  SplitRatios,
  MainTuple,
  BonusNumber,
  ISODateString,
  DrawEntity,
} from "@megawin/game-power655/entities";
import { BaseRepo } from "./base-repo";
import { DrawMapper } from "../mappers/draw-mapper";

/**
 * Valid status transitions.
 * Key = current status, Value = set of allowed next statuses.
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

export interface VoidInfo {
  reason: string;
  voidedBy?: string;
  voidedAt: Date;
}

/**
 * Repository cho kỳ quay Power 6/55.
 * Mỗi kỳ quay có kết quả gồm 6 số chính + 1 bonus number,
 * và hệ thống jackpot kép (JP1: trùng 6/6, JP2: trùng 5/6 + bonus).
 */
export class DrawRepository extends BaseRepo<DrawEntity, DrawMapper> {
  constructor() {
    super({
      collName: Power655Collections.Draws,
      dataMapper: new DrawMapper(),
    });
  }

  /** Tạo kỳ quay mới. Trả về drawId (string). */
  async createDraw(doc: Omit<DrawDoc, "_id">): Promise<string> {
    return await this.insertOne(doc as any);
  }

  /** Lấy 1 kỳ quay theo drawId. */
  async getDrawById(drawId: string): Promise<DrawEntity | null> {
    return await this.findOne({ drawId });
  }

  /** Lấy nhiều draws cùng lúc theo danh sách drawIds (1 query). */
  async getDrawsByIds(drawIds: string[]): Promise<DrawEntity[]> {
    if (drawIds.length === 0) return [];
    return await this.findMany(
      { drawId: { $in: drawIds } },
      { sort: { drawDate: 1, drawNo: 1 } }
    );
  }

  /** Lấy tất cả draws theo ngày quay, sorted theo drawNo. */
  async getDrawsByDate(drawDate: ISODateString): Promise<DrawEntity[]> {
    return await this.findMany({ drawDate }, { sort: { drawNo: 1 } });
  }

  /** Phân trang draws với filter status + khoảng ngày. */
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

  // ─── Status Transitions (atomic, type-safe) ───

  /**
   * Atomic status transition cơ bản (không kèm extra data).
   * Trả về null nếu transition không hợp lệ hoặc draw không ở trạng thái expected.
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
   * Publish kết quả: salesClosed → published.
   * Ghi result gồm winningMain (6 số chính) + bonusNumber (số đặc biệt).
   *
   * @param result.winningMain - 6 số chính trúng thưởng (sorted ascending)
   * @param result.bonusNumber - Số bonus quay từ 49 quả bóng còn lại
   */
  async publishResult(
    drawId: string,
    result: {
      winningMain: MainTuple;
      bonusNumber: BonusNumber;
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
   * Trigger settle: published → settling + ghi jackpot split info.
   */
  async triggerSettle(
    drawId: string,
    splitInfo?: {
      isSplitCycle: boolean;
      split: {
        thresholdAmount: number;
        splitRatios: SplitRatios;
        splitAmount: number;
        splitRuleVersion: string;
        hintText: string;
      };
    }
  ): Promise<DrawEntity | null> {
    const allowed = VALID_TRANSITIONS[DrawStatus.Published];
    if (!allowed?.has(DrawStatus.Settling)) return null;

    const $set: Record<string, unknown> = {
      status: DrawStatus.Settling,
      updatedAt: new Date(),
    };
    if (splitInfo) {
      $set["jackpot.isSplitCycle"] = splitInfo.isSplitCycle;
      $set["jackpot.split"] = splitInfo.split;
    }

    return await this.findOneAndUpdate(
      { drawId, status: DrawStatus.Published },
      { $set },
      { returnDocument: "after" }
    );
  }

  /**
   * Cập nhật snapshot dual jackpot cho kỳ quay.
   *
   * @param jackpot.openingJackpot1 - Giá trị JP1 đầu kỳ
   * @param jackpot.closingJackpot1 - Giá trị JP1 cuối kỳ
   * @param jackpot.openingJackpot2 - Giá trị JP2 đầu kỳ
   * @param jackpot.closingJackpot2 - Giá trị JP2 cuối kỳ
   */
  async updateJackpot(
    drawId: string,
    jackpot: {
      openingJackpot1: number;
      closingJackpot1: number;
      openingJackpot2: number;
      closingJackpot2: number;
      isSplitCycle?: boolean;
      split?: DrawSplit;
    }
  ): Promise<boolean> {
    const $set: Record<string, unknown> = {
      "jackpot.openingJackpot1": jackpot.openingJackpot1,
      "jackpot.closingJackpot1": jackpot.closingJackpot1,
      "jackpot.openingJackpot2": jackpot.openingJackpot2,
      "jackpot.closingJackpot2": jackpot.closingJackpot2,
      updatedAt: new Date(),
    };
    if (jackpot.isSplitCycle !== undefined) {
      $set["jackpot.isSplitCycle"] = jackpot.isSplitCycle;
    }
    if (jackpot.split) {
      $set["jackpot.split"] = jackpot.split;
    }
    return await this.updateOne({ drawId }, { $set });
  }

  /**
   * Cập nhật tổng kết tài chính kỳ quay.
   * Bao gồm jackpot1Contribution, jackpot2Contribution, jp1Overflow.
   */
  async updateFinancial(
    drawId: string,
    financial: NonNullable<DrawDoc["financial"]>
  ): Promise<boolean> {
    return await this.updateOne(
      { drawId },
      { $set: { financial, updatedAt: new Date() } }
    );
  }

  /** Cập nhật thống kê kỳ quay (totalEntries, totalLines, tierWinners, ...). */
  async updateStats(
    drawId: string,
    stats: NonNullable<DrawDoc["stats"]>
  ): Promise<boolean> {
    return await this.updateOne(
      { drawId },
      { $set: { stats, updatedAt: new Date() } }
    );
  }

  /** Lấy kỳ quay gần nhất (bất kỳ status). */
  async getLatestDraw(): Promise<DrawEntity | null> {
    return await this.findOne({}, { sort: { drawDate: -1, drawNo: -1 } });
  }

  /** Lấy kỳ quay settled gần nhất. */
  async getLatestSettledDraw(): Promise<DrawEntity | null> {
    return await this.findOne(
      { status: DrawStatus.Settled },
      { sort: { drawDate: -1, drawNo: -1 } }
    );
  }

  /** Lấy kỳ quay settled gần nhất trước hoặc bằng drawDate cho trước. */
  async getLatestSettledDrawBefore(
    drawDate: string
  ): Promise<DrawEntity | null> {
    return await this.findOne(
      {
        status: DrawStatus.Settled,
        drawDate: { $lte: drawDate },
      },
      { sort: { drawDate: -1, drawNo: -1 } }
    );
  }

  /** Lấy kỳ quay đang mở bán (hoặc custom statuses). */
  async getCurrentDraw(allowStatuses?: string[]): Promise<DrawEntity | null> {
    const statuses = allowStatuses ?? [DrawStatus.SalesOpen];

    const draw = await this.findOne(
      { status: { $in: statuses } },
      { sort: { drawDate: 1, drawNo: 1 } }
    );
    return draw;
  }

  /** Lấy tất cả draws đang active (theo danh sách statuses). */
  async getActiveDraws(allowStatuses: string[]): Promise<DrawEntity[]> {
    return await this.findMany(
      { status: { $in: allowStatuses } },
      { sort: { drawDate: 1, drawNo: 1 } }
    );
  }

  /** Cập nhật tổng kết void cho kỳ quay bị huỷ. */
  async updateVoidSummary(
    drawId: string,
    summary: NonNullable<DrawDoc["voidSummary"]>
  ): Promise<boolean> {
    return await this.updateOne(
      { drawId },
      { $set: { voidSummary: summary, updatedAt: new Date() } }
    );
  }

  /** Cập nhật lịch mở/đóng bán vé và drawTime. */
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

  /**
   * Cập nhật kết quả (khi cần sửa sau publish).
   * Chỉ cho phép khi draw đang ở status Published.
   *
   * @param result.winningMain - 6 số chính trúng thưởng
   * @param result.bonusNumber - Số bonus đặc biệt
   */
  async updateResult(
    drawId: string,
    result: {
      winningMain: MainTuple;
      bonusNumber: BonusNumber;
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
}

export { VALID_TRANSITIONS };
