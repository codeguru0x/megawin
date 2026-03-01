/**
 * Game Core – Ticket Counter Repository
 *
 * Cấp phát số thứ tự ticketNo cho mỗi account theo ngày.
 * Shared across all games — 1 counter duy nhất per account per day.
 *
 * Dùng findOneAndUpdate + $inc + upsert (atomic, crash-safe).
 * Mỗi ngày mới tự động tạo document mới (counter reset về 1).
 *
 * Cách dùng từ use case game:
 *   private readonly ticketCounter = new TicketCounterRepository();
 *   const { seq, date } = await this.ticketCounter.nextTicketSeq(accountId);
 *   const ticketNo = buildTicketNo("KENO", date, seq);
 */

import {
  GameCoreCollections,
  getTodayDateVN,
} from "@megawin/game-core/entities";
import type { BaseEntity } from "@megawin/data/mongo";
import { GameCoreBaseRepo } from "./game-core-base-repo";

export interface TicketSeqResult {
  /** Số thứ tự mới (1-based). */
  seq: number;
  /** Ngày YYYYMMDD (Asia/Ho_Chi_Minh). */
  date: string;
}

export class TicketCounterRepository extends GameCoreBaseRepo<BaseEntity> {
  constructor() {
    super({
      collName: GameCoreCollections.TicketCounters,
    });
  }

  /**
   * Allocate 1 ticket sequence number cho account hôm nay.
   *
   * Atomic: $inc đảm bảo không trùng ngay cả khi concurrent.
   * Upsert: tự tạo document nếu chưa có (ngày mới).
   */
  async nextTicketSeq(accountId: string): Promise<TicketSeqResult> {
    const date = getTodayDateVN();

    const result = await this.findOneAndUpdate(
      { accountId, date },
      {
        $inc: { seq: 1 },
        $set: { updatedAt: new Date() },
      },
      { upsert: true, returnDocument: "after" }
    );

    if (!result) {
      throw new Error(
        `Failed to allocate ticket seq for account ${accountId} date ${date}`
      );
    }

    return {
      seq: (result as any).seq as number,
      date,
    };
  }
}
