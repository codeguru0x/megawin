import {
  Lotto535Collections,
  JackpotCycleStatus,
  type JackpotCycleDoc,
  type JackpotCycleCloseReason,
  type JackpotSplitDetail,
  type JackpotWinnerInfo,
  type SplitRatios,
} from "@megawin/game-lotto535/entities";
import { BaseRepo } from "./base-repo";
import { JackpotCycleMapper } from "../mappers/jackpot-cycle-mapper";
import type { JackpotCycleEntity } from "@megawin/game-lotto535/entities";

export class JackpotCycleRepository extends BaseRepo<JackpotCycleEntity, JackpotCycleMapper> {
  constructor() {
    super({
      collName: Lotto535Collections.JackpotCycles,
      dataMapper: new JackpotCycleMapper(),
    });
  }

  /** Lấy cycle đang active (chỉ có 1 tại 1 thời điểm). */
  async getActiveCycle(): Promise<JackpotCycleEntity | null> {
    return this.findOne({ status: JackpotCycleStatus.Active });
  }

  /** Tạo cycle mới. Guard: skip nếu đã có active cycle (idempotent khi retry). */
  async createCycle(input: {
    startDrawId: string;
    seedAmount: number;
    config: { splitThreshold: number; splitRatios: SplitRatios };
  }): Promise<void> {
    const existing = await this.findOne({ status: JackpotCycleStatus.Active });
    if (existing) return;

    const maxCycle = await this.findOne({}, { sort: { cycleNo: -1 } });
    const cycleNo = (maxCycle?.cycleNo ?? 0) + 1;
    const now = new Date();

    const doc: Omit<JackpotCycleDoc, "_id"> = {
      cycleNo,
      status: JackpotCycleStatus.Active,
      startDrawId: input.startDrawId,
      startedAt: now,
      seedAmount: input.seedAmount,
      currentAmount: input.seedAmount,
      peakAmount: input.seedAmount,
      totalContribution: 0,
      drawCount: 0,
      config: input.config,
      createdAt: now,
      updatedAt: now,
    };

    await this.insertOne(doc);
  }

  /**
   * Cập nhật thống kê cycle sau mỗi draw settle.
   * Idempotent: ghi đè giá trị dựa trên draw cuối cùng.
   */
  async updateCycleStats(input: {
    cycleNo: number;
    currentAmount: number;
    contribution: number;
    drawCount: number;
    lastSettledDrawId: string;
  }): Promise<void> {
    await this.updateOne(
      {
        cycleNo: input.cycleNo,
        status: JackpotCycleStatus.Active,
      },
      {
        $set: {
          currentAmount: input.currentAmount,
          totalContribution: input.contribution,
          drawCount: input.drawCount,
          lastSettledDrawId: input.lastSettledDrawId,
          updatedAt: new Date(),
        },
        $max: { peakAmount: input.currentAmount },
      },
    );
  }

  /** Đóng cycle (winner / split / manual_reset). */
  async closeCycle(input: {
    cycleNo: number;
    endDrawId: string;
    closeReason: JackpotCycleCloseReason;
    finalAmount: number;
    drawCount: number;
    splitDetail?: JackpotSplitDetail;
    winners?: JackpotWinnerInfo[];
  }): Promise<void> {
    const now = new Date();

    type CycleCloseSet = {
      status: JackpotCycleDoc["status"];
      endDrawId: string;
      closedAt: Date;
      closeReason: JackpotCycleCloseReason;
      currentAmount: number;
      drawCount: number;
      updatedAt: Date;
      splitDetail?: JackpotSplitDetail;
      winners?: JackpotWinnerInfo[];
    };

    const $set: CycleCloseSet = {
      status: JackpotCycleStatus.Closed,
      endDrawId: input.endDrawId,
      closedAt: now,
      closeReason: input.closeReason,
      currentAmount: input.finalAmount,
      drawCount: input.drawCount,
      updatedAt: now,
    };

    if (input.splitDetail) $set.splitDetail = input.splitDetail;
    if (input.winners) $set.winners = input.winners;

    await this.updateOne(
      {
        cycleNo: input.cycleNo,
        status: JackpotCycleStatus.Active,
      },
      {
        $set: $set as unknown as Record<string, unknown>,
        $max: { peakAmount: input.finalAmount },
      },
    );
  }

  /** Tìm cycle đã đóng cho 1 drawId cụ thể. */
  async findClosedByEndDrawId(endDrawId: string): Promise<JackpotCycleEntity | null> {
    return this.findOne({ endDrawId, status: JackpotCycleStatus.Closed });
  }

  /** Lấy danh sách cycles đã đóng (mới nhất trước). */
  async listClosedCycles(page: number, size: number): Promise<JackpotCycleEntity[]> {
    return this.findMany(
      { status: JackpotCycleStatus.Closed },
      {
        sort: { closedAt: -1 },
        skip: (page - 1) * size,
        limit: size,
      },
    );
  }

  /** Đếm tổng cycles đã đóng. */
  async countClosedCycles(): Promise<number> {
    return this.count({ status: JackpotCycleStatus.Closed });
  }

  /**
   * Lấy 1 cycle theo cycleNo.
   * Dùng khi cần biết startDrawId + endDrawId để lọc draws trong cycle đó.
   */
  async getCycleByNo(cycleNo: number): Promise<JackpotCycleEntity | null> {
    return this.findOne({ cycleNo });
  }

  /**
   * Lấy tất cả cycles từ mới nhất đến cũ nhất — dùng cho cycle selector dropdown.
   * Active cycle (nếu có) luôn xuất hiện đầu tiên.
   * Số lượng cycles thường nhỏ (hàng chục), Lấy mặc định 10 cycles.
   */
  async listAllCycles(limit: number = 10): Promise<JackpotCycleEntity[]> {
    return this.findMany(
      {},
      {
        sort: { cycleNo: -1 },
        limit,
      },
    );
  }
}
