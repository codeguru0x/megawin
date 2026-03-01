import {
  Mega645Collections,
  JackpotCycleStatus,
  type JackpotCycleDoc,
  type JackpotCycleCloseReason,
  type JackpotWinnerInfo,
  type SplitRatios,
} from "@megawin/game-mega645/entities";
import { BaseRepo } from "./base-repo";
import {
  JackpotCycleMapper,
  type JackpotCycleEntity,
} from "../mappers/jackpot-cycle-mapper";

const mapper = new JackpotCycleMapper();

export class JackpotCycleRepository extends BaseRepo<
  JackpotCycleEntity,
  JackpotCycleMapper
> {
  constructor() {
    super({
      collName: Mega645Collections.JackpotCycles,
      dataMapper: mapper,
    });
  }

  /** Lấy cycle đang active (chỉ có 1 tại 1 thời điểm). */
  async getActiveCycle(): Promise<JackpotCycleEntity | null> {
    return this.findOne({ status: JackpotCycleStatus.Active });
  }

  /** Tạo cycle mới. */
  async createCycle(input: {
    startDrawId: string;
    seedAmount: number;
    config: { splitThreshold: number; splitRatios: SplitRatios };
  }): Promise<void> {
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

    await this.insertOne(doc as any);
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
    const col = await this.getCollection();
    await col.updateOne(
      { cycleNo: input.cycleNo, status: JackpotCycleStatus.Active },
      {
        $set: {
          currentAmount: input.currentAmount,
          totalContribution: input.contribution,
          drawCount: input.drawCount,
          lastSettledDrawId: input.lastSettledDrawId,
          updatedAt: new Date(),
        },
        $max: { peakAmount: input.currentAmount },
      }
    );
  }

  /** Đóng cycle (winner / split / manual_reset). */
  async closeCycle(input: {
    cycleNo: number;
    endDrawId: string;
    closeReason: JackpotCycleCloseReason;
    finalAmount: number;
    splitDetail?: JackpotCycleDoc["splitDetail"];
    winners?: JackpotWinnerInfo[];
  }): Promise<void> {
    const col = await this.getCollection();
    const now = new Date();

    const $set: Record<string, unknown> = {
      status: JackpotCycleStatus.Closed,
      endDrawId: input.endDrawId,
      closedAt: now,
      closeReason: input.closeReason,
      currentAmount: input.finalAmount,
      updatedAt: now,
    };

    if (input.splitDetail) $set.splitDetail = input.splitDetail;
    if (input.winners) $set.winners = input.winners;

    await col.updateOne(
      { cycleNo: input.cycleNo, status: JackpotCycleStatus.Active },
      { $set, $max: { peakAmount: input.finalAmount } }
    );
  }

  /** Lấy danh sách cycles đã đóng (mới nhất trước). */
  async listClosedCycles(
    page: number,
    size: number
  ): Promise<JackpotCycleEntity[]> {
    return this.findMany(
      { status: JackpotCycleStatus.Closed },
      { sort: { closedAt: -1 }, skip: (page - 1) * size, limit: size }
    );
  }

  /** Đếm tổng cycles đã đóng. */
  async countClosedCycles(): Promise<number> {
    return this.count({ status: JackpotCycleStatus.Closed });
  }
}
