/**
 * Power 6/55 – Jackpot Cycle Repository
 *
 * Collection: power655JackpotCycles
 *
 * Power 6/55 có 2 jackpot (JP1 + JP2) chạy song song trong 1 cycle.
 * Cycle document lưu cả jackpot1CurrentAmount và jackpot2CurrentAmount.
 *
 * Theo thể lệ Vietlott:
 *   - Cycle chỉ đóng khi JP1 có winner (hoặc admin reset).
 *   - JP2 winner KHÔNG đóng cycle — JP2 reset về seed trong cycle,
 *     ghi lịch sử vào jackpot2Resets[] qua resetJp2InCycle().
 *   - JP2 có thể reset nhiều lần trong 1 cycle.
 */

import {
  Power655Collections,
  type JackpotCycleDoc,
  type JackpotCycleConfig,
  type JackpotCycleClosedReason,
  type JackpotWinnerInfo,
  type Jackpot2ResetRecord,
  type JackpotCycleEntity,
  JackpotCycleStatus,
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

  /**
   * Tạo cycle mới với dual jackpot seed amounts và config snapshot.
   *
   * Guard: skip nếu đã có active cycle → idempotent khi retry.
   * jackpot2ResetCount = 0, jackpot2Resets = [] (chưa có JP2 reset nào).
   */
  async createCycle(input: {
    startDrawId: string;
    jp1SeedAmount: number;
    jp2SeedAmount: number;
    config: JackpotCycleConfig;
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
      jackpot1SeedAmount: input.jp1SeedAmount,
      jackpot1CurrentAmount: input.jp1SeedAmount,
      jackpot2SeedAmount: input.jp2SeedAmount,
      jackpot2CurrentAmount: input.jp2SeedAmount,
      drawCount: 0,
      config: input.config,
      jackpot2ResetCount: 0,
      jackpot2Resets: [],
      createdAt: now,
      updatedAt: now,
    };

    await this.insertOne(doc);
  }

  /**
   * Cập nhật dual jackpot stats sau mỗi draw settle (roll-over, không có winner).
   *
   * Idempotent: ghi đè giá trị tuyệt đối (không $inc).
   * Chỉ dùng cho roll-over flow — khi JP2 winner, dùng resetJp2InCycle() thay thế.
   */
  async updateCycleStats(input: {
    cycleNo: number;
    jackpot1CurrentAmount: number;
    jackpot2CurrentAmount: number;
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
          jackpot1CurrentAmount: input.jackpot1CurrentAmount,
          jackpot2CurrentAmount: input.jackpot2CurrentAmount,
          drawCount: input.drawCount,
          updatedAt: new Date(),
        },
      },
    );
  }

  /**
   * Reset JP2 về seed trong cycle hiện tại sau khi JP2 có winner.
   *
   * Theo thể lệ Vietlott: JP2 winner KHÔNG đóng cycle — chỉ reset jackpot2CurrentAmount
   * về seed, JP1 tiếp tục tích lũy bình thường.
   *
   * Sau khi chạy, cả 2 CurrentAmount đều = "số tiền thực tế trong pool":
   *   - jackpot1CurrentAmount = opening + contribution (JP1 tiếp tục tích lũy)
   *   - jackpot2CurrentAmount = seedAmount (JP2 đã trao thưởng, pool reset về seed)
   *   → Giá trị closing JP2 TRƯỚC reset lưu trong jackpot2Resets[].jackpot2PrizePool.
   *
   * Idempotent nhờ filter: chỉ reset khi jackpot2CurrentAmount ≠ seedAmount.
   * Nếu đã reset (retry), jackpot2CurrentAmount = seed → no-op.
   *
   * Ghi lịch sử reset vào jackpot2Resets[] qua $push (append) và tăng jackpot2ResetCount.
   * JP1 stats (jackpot1CurrentAmount, drawCount) cũng được cập nhật trong cùng 1 call.
   */
  async resetJp2InCycle(input: {
    cycleNo: number;
    /** Số tiền JP1 hiện tại sau settle (VND) = opening + contribution. */
    jackpot1CurrentAmount: number;
    /** Số tiền JP2 hiện tại sau reset (VND) = seedAmount (pool đã trao cho winners). */
    jackpot2CurrentAmount: number;
    drawCount: number;
    resetRecord: Jackpot2ResetRecord;
  }): Promise<void> {
    const now = new Date();

    // $push và $inc cần cast do mongodb driver typing strict với Document
    const update = {
      $set: {
        // JP1 tiếp tục tích lũy: opening + contribution kỳ này
        jackpot1CurrentAmount: input.jackpot1CurrentAmount,
        // JP2 reset về seed: pool đã trao cho winners, bắt đầu tích lũy lại
        jackpot2CurrentAmount: input.jackpot2CurrentAmount,
        drawCount: input.drawCount,
        updatedAt: now,
      },
      $push: { jackpot2Resets: input.resetRecord },
      $inc: { jackpot2ResetCount: 1 },
    } as unknown as Record<string, unknown>;

    await this.updateOne(
      {
        cycleNo: input.cycleNo,
        status: JackpotCycleStatus.Active,
        // Idempotent guard: chỉ reset nếu JP2 chưa được reset về seed.
        // Nếu jackpot2CurrentAmount đã = giá trị mới (seed) → đã reset trước đó → no-op.
        jackpot2CurrentAmount: { $ne: input.jackpot2CurrentAmount },
      },
      update,
    );
  }

  /**
   * Đóng cycle khi JP1 có winner (hoặc manual reset).
   *
   * Chỉ đóng khi status = "active" → idempotent (no-op nếu đã closed).
   * winners: chỉ chứa JP1 winners — JP2 winners lưu trong jackpot2Resets[].
   *
   * jackpot2CurrentAmount được ghi với giá trị carry-over (không reset về seed),
   * trừ khi cùng kỳ JP2 cũng có winner (BothWinner) — khi đó JP2 đã reset trong
   * resetJp2InCycle() trước bước này, jackpot2CurrentAmount sẽ = jp2SeedAmount.
   */
  async closeCycle(input: {
    cycleNo: number;
    endDrawId: string;
    closedReason: JackpotCycleClosedReason;
    finalJp1: number;
    finalJp2: number;
    drawCount: number;
    winners?: JackpotWinnerInfo[];
  }): Promise<void> {
    const now = new Date();

    type CycleCloseSet = {
      status: JackpotCycleDoc["status"];
      endDrawId: string;
      closedAt: Date;
      closedReason: JackpotCycleClosedReason;
      jackpot1CurrentAmount: number;
      jackpot2CurrentAmount: number;
      drawCount: number;
      updatedAt: Date;
      winners?: JackpotWinnerInfo[];
    };

    const $set: CycleCloseSet = {
      status: JackpotCycleStatus.Closed,
      endDrawId: input.endDrawId,
      closedAt: now,
      closedReason: input.closedReason,
      jackpot1CurrentAmount: input.finalJp1,
      jackpot2CurrentAmount: input.finalJp2,
      drawCount: input.drawCount,
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

  /**
   * Tìm cycle đã có JP2 reset trong kỳ drawId (dùng cho retry detection khi JP2 winner).
   *
   * Nếu jackpot2Resets có phần tử với drawId → resetJp2InCycle đã chạy thành công.
   */
  async findCycleWithJp2ResetForDraw(drawId: string): Promise<JackpotCycleEntity | null> {
    return this.findOne({ "jackpot2Resets.drawId": drawId });
  }

  /**
   * Tìm cycle closed gần nhất (theo cycleNo giảm dần).
   *
   * Dùng trong create-draws để xác định JP2 carry-over khi không có active cycle
   * (recovery sau crash giữa settle).
   *
   * Return giá trị đầy đủ bao gồm closedReason và jackpot2CurrentAmount (= finalJp2
   * tại thời điểm đóng cycle) để caller quyết định JP2 seed cycle mới.
   */
  async findLastClosedCycle(): Promise<JackpotCycleEntity | null> {
    return this.findOne({ status: JackpotCycleStatus.Closed }, { sort: { cycleNo: -1 } });
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
   * Lấy cycle theo cycleNo.
   *
   * Dùng khi cần truy xuất đúng cycle để xác định startDrawId / endDrawId
   * cho bước lọc lịch sử draws trong cycle.
   */
  async getCycleByNo(cycleNo: number): Promise<JackpotCycleEntity | null> {
    return this.findOne({ cycleNo });
  }

  /**
   * Lấy danh sách cycles gần nhất (active + closed) để populate selector UI.
   *
   * Thứ tự: active trước (nếu có), closed sau theo cycleNo giảm dần.
   * `limit` chỉ áp dụng cho phần closed — active luôn được trả về.
   *
   * @param closedLimit - Số lượng closed cycles tối đa (mặc định 9, cộng với 1 active = 10).
   */
  async listAllCycles(closedLimit = 9): Promise<JackpotCycleEntity[]> {
    // Lấy active cycle song song với closed cycles để giảm latency.
    const [active, closed] = await Promise.all([
      this.findOne({ status: JackpotCycleStatus.Active }),
      this.findMany(
        { status: JackpotCycleStatus.Closed },
        { sort: { cycleNo: -1 }, limit: closedLimit },
      ),
    ]);

    // Active đứng đầu danh sách, closed theo sau.
    return active ? [active, ...closed] : closed;
  }
}
