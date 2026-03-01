/**
 * Power 6/55 – Jackpot Cycle Repository
 *
 * Collection: power655JackpotCycles
 *
 * Power 6/55 có 2 jackpot (JP1 + JP2) chạy song song trong 1 cycle.
 * Cycle document lưu cả jackpot1Current và jackpot2Current.
 */

import { Power655Collections } from "@megawin/game-power655/entities";
import type {
  JackpotCycleDoc,
  JackpotCycleEntity,
  JackpotCycleClosedReason,
  SplitRatios,
} from "@megawin/game-power655/entities";
import { BaseRepo } from "./base-repo";
import { JackpotCycleMapper } from "../mappers/jackpot-cycle-mapper";

const mapper = new JackpotCycleMapper();

export class JackpotCycleRepository extends BaseRepo<
  JackpotCycleEntity,
  JackpotCycleMapper
> {
  constructor() {
    super({
      collName: Power655Collections.JackpotCycles,
      dataMapper: mapper,
    });
  }

  /** Lấy cycle đang active (chỉ có 1 tại 1 thời điểm). */
  async getActiveCycle(): Promise<JackpotCycleEntity | null> {
    return this.findOne({ status: "active" });
  }

  /** Tạo cycle mới với dual jackpot seed amounts. */
  async createCycle(input: {
    startDrawId: string;
    jp1SeedAmount: number;
    jp2SeedAmount: number;
    config: { splitThreshold: number; splitRatios: SplitRatios };
  }): Promise<void> {
    const maxCycle = await this.findOne({}, { sort: { cycleNo: -1 } });
    const cycleNo = (maxCycle?.cycleNo ?? 0) + 1;
    const now = new Date();

    const doc: Omit<JackpotCycleDoc, "_id"> = {
      cycleNo,
      status: "active",
      startDrawId: input.startDrawId,
      jackpot1Opening: input.jp1SeedAmount,
      jackpot1Current: input.jp1SeedAmount,
      jackpot2Opening: input.jp2SeedAmount,
      jackpot2Current: input.jp2SeedAmount,
      drawCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    await this.insertOne(doc as any);
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
    const col = await this.getCollection();
    await col.updateOne(
      { cycleNo: input.cycleNo, status: "active" },
      {
        $set: {
          jackpot1Current: input.jackpot1Current,
          jackpot2Current: input.jackpot2Current,
          drawCount: input.drawCount,
          updatedAt: new Date(),
        },
      }
    );
  }

  /** Đóng cycle (winner / split). */
  async closeCycle(input: {
    cycleNo: number;
    endDrawId: string;
    closedReason: JackpotCycleClosedReason;
    finalJp1: number;
    finalJp2: number;
    splitDetail?: any;
    winners?: any[];
  }): Promise<void> {
    const col = await this.getCollection();
    const now = new Date();

    const $set: Record<string, unknown> = {
      status: "closed",
      endDrawId: input.endDrawId,
      closedAt: now,
      closedReason: input.closedReason,
      jackpot1Current: input.finalJp1,
      jackpot2Current: input.finalJp2,
      updatedAt: now,
    };

    if (input.splitDetail) $set.splitDetail = input.splitDetail;
    if (input.winners) $set.winners = input.winners;

    await col.updateOne(
      { cycleNo: input.cycleNo, status: "active" },
      { $set }
    );
  }

  /** Lấy danh sách cycles đã đóng (mới nhất trước). */
  async listClosedCycles(
    page: number,
    size: number
  ): Promise<JackpotCycleEntity[]> {
    return this.findMany(
      { status: "closed" },
      { sort: { closedAt: -1 }, skip: (page - 1) * size, limit: size }
    );
  }

  /** Đếm tổng cycles đã đóng. */
  async countClosedCycles(): Promise<number> {
    return this.count({ status: "closed" });
  }
}
