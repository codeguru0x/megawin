/**
 * Power 6/55 – Jackpot Cycle Repository
 *
 * Collection: power655JackpotCycles
 *
 * Power 6/55 có 2 jackpot (JP1 + JP2) chạy song song trong 1 cycle.
 * Cycle document lưu cả jackpot1Current và jackpot2Current.
 */

import {
  Power655Collections,
  type JackpotCycleDoc,
  type JackpotCycleClosedReason,
  type JackpotWinnerInfo,
  type JackpotCycleEntity,
  JackpotCycleStatus,
  JackpotCycleClosedReasons,
} from "@megawin/game-power655/entities";
import { BaseRepo } from "./base-repo";
import { JackpotCycleMapper } from "../mappers/jackpot-cycle-mapper";

export class JackpotCycleRepository extends BaseRepo<JackpotCycleEntity, JackpotCycleMapper> {
  constructor() {
    super({
      collName: Power655Collections.JackpotCycles,
      dataMapper: new JackpotCycleMapper(),
    });
  }

  /** Lấy cycle đang active (chỉ có 1 tại 1 thời điểm). */
  async getActiveCycle(): Promise<JackpotCycleEntity | null> {
    return this.findOne({ status: JackpotCycleStatus.Active });
  }

  /** Tạo cycle mới với dual jackpot seed amounts. Guard: skip nếu đã có active cycle (idempotent khi retry). */
  async createCycle(input: {
    startDrawId: string;
    jp1SeedAmount: number;
    jp2SeedAmount: number;
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
      jackpot1Opening: input.jp1SeedAmount,
      jackpot1Current: input.jp1SeedAmount,
      jackpot2Opening: input.jp2SeedAmount,
      jackpot2Current: input.jp2SeedAmount,
      drawCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    await this.insertOne(doc);
  }

  /**
   * Cập nhật dual jackpot stats sau mỗi draw settle.
   * Idempotent: ghi đè giá trị dựa trên draw cuối cùng.
   */
  async updateCycleStats(input: {
    cycleNo: number;
    jackpot1Current: number;
    jackpot2Current: number;
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
          jackpot1Current: input.jackpot1Current,
          jackpot2Current: input.jackpot2Current,
          drawCount: input.drawCount,
          updatedAt: new Date(),
        },
      },
    );
  }

  /** Đóng cycle (winner). */
  async closeCycle(input: {
    cycleNo: number;
    endDrawId: string;
    closedReason: JackpotCycleClosedReason;
    finalJp1: number;
    finalJp2: number;
    winners?: JackpotWinnerInfo[];
  }): Promise<void> {
    const now = new Date();

    type CycleCloseSet = {
      status: JackpotCycleDoc["status"];
      endDrawId: string;
      closedAt: Date;
      closedReason: JackpotCycleClosedReason;
      jackpot1Current: number;
      jackpot2Current: number;
      updatedAt: Date;
      winners?: JackpotWinnerInfo[];
    };

    const $set: CycleCloseSet = {
      status: JackpotCycleStatus.Closed,
      endDrawId: input.endDrawId,
      closedAt: now,
      closedReason: input.closedReason,
      jackpot1Current: input.finalJp1,
      jackpot2Current: input.finalJp2,
      updatedAt: now,
    };

    if (input.winners) $set.winners = input.winners;

    await this.updateOne(
      {
        cycleNo: input.cycleNo,
        status: JackpotCycleStatus.Active,
      },
      { $set: $set as unknown as Record<string, unknown> },
    );
  }

  /** Tìm cycle đã closed có endDrawId = drawId (dùng cho retry detection trong FinalizeSettle). */
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
