/**
 * Mega 6/45 – Jackpot Cycle Repository
 *
 * Collection: mega645_jackpot_cycles
 *
 * Mega 6/45 theo luật Vietlott: cycle chỉ đóng khi có winner hoặc manual_reset.
 * Không có Split Cycle — không lưu splitDetail.
 */

import {
  Mega645Collections,
  JackpotCycleStatus,
  type JackpotCycleDoc,
  type JackpotCycleCloseReason,
  type JackpotWinnerInfo,
} from "@megawin/game-mega645/entities";
import { BaseRepo } from "./base-repo";
import { JackpotCycleMapper, type JackpotCycleEntity } from "../mappers/jackpot-cycle-mapper";

export class JackpotCycleRepository extends BaseRepo<JackpotCycleEntity, JackpotCycleMapper> {
  constructor() {
    super({
      collName: Mega645Collections.JackpotCycles,
      dataMapper: new JackpotCycleMapper(),
    });
  }

  /** Lấy cycle đang active (chỉ có 1 tại 1 thời điểm). */
  async getActiveCycle(): Promise<JackpotCycleEntity | null> {
    return this.findOne({ status: JackpotCycleStatus.Active });
  }

  /** Tạo cycle mới. Guard: skip nếu đã có active cycle (idempotent khi retry). */
  async createCycle(input: { startDrawId: string; seedAmount: number }): Promise<void> {
    // Guard: nếu đã có active cycle (crash sau create, retry lại) → skip.
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

  /** Đóng cycle (winner / manual_reset). */
  async closeCycle(input: {
    cycleNo: number;
    endDrawId: string;
    closeReason: JackpotCycleCloseReason;
    finalAmount: number;
    drawCount: number;
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

  /**
   * Tìm cycle đã đóng (closed) cho draw cụ thể — dùng để detect retry trong winner flow.
   * Nếu tìm thấy → closeCycle đã chạy thành công lần trước → skip, chỉ ensureNextCycle.
   */
  async findClosedByEndDrawId(drawId: string): Promise<JackpotCycleEntity | null> {
    return this.findOne({ status: JackpotCycleStatus.Closed, endDrawId: drawId });
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
}
