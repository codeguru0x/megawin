import type { BaseEntity } from "@megawin/data/mongo";
import type { SeqAllocation } from "@megawin/game-core/entities";
import { ENTRY_CHANGE_SEQ_KEY, GameCoreCollections } from "@megawin/game-core/entities";
import { Long } from "mongodb";

import { GameCoreBaseRepo } from "./game-core-base-repo";

/**
 * Repository cho collection entryChangeSeq.
 *
 * Global singleton sequence counter cho toàn hệ thống.
 * Tất cả game dùng chung 1 counter → tenant chỉ cần 1 cursor để poll.
 *
 * Dùng findOneAndUpdate + $inc + upsert để đảm bảo atomic,
 * không bị trùng version ngay cả khi nhiều worker cùng chạy.
 *
 * Không cần mapper riêng – chỉ dùng findOneAndUpdate trả raw document
 * và findOneAsDocument. DefaultMongoMapper được dùng mặc định.
 */
export class EntryChangeSeqRepository extends GameCoreBaseRepo<BaseEntity> {
  constructor() {
    super({
      collName: GameCoreCollections.EntryChangeSeq,
    });
  }

  /**
   * Allocate 1 sequence number mới (global).
   */
  async nextSeq(): Promise<Long> {
    return (await this.allocateSeq(1)).endSeq;
  }

  /**
   * Allocate 1 batch N sequence numbers (global).
   *
   * Ví dụ: current seq = 100, allocateSeq(3) → { startSeq: 101, endSeq: 103 }
   * Sau allocate, seq trong DB = 103.
   */
  async allocateSeq(count: number): Promise<SeqAllocation> {
    if (count <= 0) {
      throw new Error("count must be > 0");
    }

    const result = await this.findOneAndUpdate(
      { key: ENTRY_CHANGE_SEQ_KEY },
      {
        $inc: { seq: Long.fromNumber(count) },
        $set: { updatedAt: new Date() },
      },
      { upsert: true, returnDocument: "after" },
    );

    if (!result) {
      throw new Error("Failed to allocate global entry change seq");
    }

    const rawSeq = (result as any).seq;
    const endSeq = rawSeq instanceof Long ? rawSeq : Long.fromNumber(Number(rawSeq));
    const startSeq = Long.fromBigInt(endSeq.toBigInt() - BigInt(count - 1));

    return { startSeq, endSeq };
  }

  /**
   * Đọc sequence hiện tại (không increment).
   * Dùng cho monitoring / debug.
   */
  async getCurrentSeq(): Promise<Long> {
    const doc = await this.findOneAsDocument({
      key: ENTRY_CHANGE_SEQ_KEY,
    });

    if (!doc) {
      return Long.fromNumber(0);
    }
    return doc.seq as Long;
  }
}
