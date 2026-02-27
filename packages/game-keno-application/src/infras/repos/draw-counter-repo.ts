/**
 * Keno – Draw Counter Repository
 *
 * Collection: keno_draw_counters
 *
 * Quản lý atomic counter cho drawNo mỗi ngày.
 * Dùng $inc + upsert để đảm bảo race-safe.
 */

import { KenoCollections } from "@megawin/game-keno/entities";
import { BaseRepo } from "./base-repo";
import {
  DrawCounterMapper,
  type DrawCounterEntity,
} from "../mappers/draw-counter-mapper";

export class DrawCounterRepository extends BaseRepo<
  DrawCounterEntity,
  DrawCounterMapper
> {
  constructor() {
    super({
      collName: KenoCollections.DrawCounters,
      dataMapper: new DrawCounterMapper(),
    });
  }

  /**
   * Atomic increment drawNo cho 1 ngày.
   * Nếu chưa có counter cho ngày đó → tạo mới với lastDrawNo = 1.
   * Trả về drawNo mới (giá trị sau khi tăng).
   */
  async getNextDrawNo(drawDate: string): Promise<number> {
    await this.initBeforeUse();

    const result = await this._collection.findOneAndUpdate(
      { drawDate },
      { $inc: { lastDrawNo: 1 } },
      { upsert: true, returnDocument: "after" }
    );

    return result!.lastDrawNo as number;
  }

  /**
   * Atomic increment drawNo cho N kỳ 1 lúc.
   * Trả về drawNo ĐẦU TIÊN trong batch.
   *
   * VD: lastDrawNo hiện tại = 5, count = 10
   *   → $inc: 10 → lastDrawNo = 15
   *   → first drawNo = 15 - 10 + 1 = 6
   */
  async getNextDrawNoBatch(drawDate: string, count: number): Promise<number> {
    await this.initBeforeUse();

    const result = await this._collection.findOneAndUpdate(
      { drawDate },
      { $inc: { lastDrawNo: count } },
      { upsert: true, returnDocument: "after" }
    );

    const lastDrawNo = result!.lastDrawNo as number;
    return lastDrawNo - count + 1;
  }
}
