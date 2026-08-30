/**
 * Bingo 18 – Draw Counter Repository
 *
 * Collection: bingo18_draw_counters
 *
 * Quản lý atomic counter cho drawNo mỗi ngày.
 * Dùng $inc + upsert để đảm bảo race-safe.
 */

import type { DrawCounterEntity } from "@megawin/game-bingo18/entities";
import { Bingo18Collections } from "@megawin/game-bingo18/entities";
import { AppException } from "@megawin/shared/errors";

import { DrawCounterMapper } from "../mappers/draw-counter-mapper";
import { BaseRepo } from "./base-repo";

export class DrawCounterRepository extends BaseRepo<DrawCounterEntity, DrawCounterMapper> {
  constructor() {
    super({
      collName: Bingo18Collections.DrawCounters,
      dataMapper: new DrawCounterMapper(),
    });
  }

  /**
   * Atomic increment drawNo cho 1 ngày.
   * Nếu chưa có counter cho ngày đó → tạo mới với lastDrawNo = 1.
   * Trả về drawNo mới (giá trị sau khi tăng).
   *
   * Dùng `findOneAndUpdate` kế thừa từ `MongoRepository` (KHÔNG đụng `_collection`
   * trực tiếp) — base method tự lo `initBeforeUse()` + map document qua `_dataMapper`.
   *
   * `result` chỉ `null` khi driver/DB có sự cố bất thường (`upsert: true` về lý thuyết luôn
   * trả document) — log kỹ thuật để audit, throw `AppException` với message chung, KHÔNG lộ
   * tên class/method ra client (xem `error-handling-conventions.mdc`).
   */
  async getNextDrawNo(drawDate: string): Promise<number> {
    const result = await this.findOneAndUpdate(
      { drawDate },
      { $inc: { lastDrawNo: 1 } },
      { upsert: true, returnDocument: "after" },
    );

    if (!result) {
      throw AppException.internal("Không thể sinh số kỳ quay, vui lòng thử lại.");
    }

    return result.lastDrawNo;
  }

  /**
   * Atomic increment drawNo cho N kỳ 1 lúc.
   * Trả về drawNo ĐẦU TIÊN trong batch.
   *
   * VD: lastDrawNo hiện tại = 5, count = 10
   *   → $inc: 10 → lastDrawNo = 15
   *   → first drawNo = 15 - 10 + 1 = 6
   *
   * Dùng `findOneAndUpdate` kế thừa từ `MongoRepository` (KHÔNG đụng `_collection`
   * trực tiếp) — base method tự lo `initBeforeUse()` + map document qua `_dataMapper`.
   *
   * `result` chỉ `null` khi driver/DB có sự cố bất thường (`upsert: true` về lý thuyết luôn
   * trả document) — log kỹ thuật để audit, throw `AppException` với message chung, KHÔNG lộ
   * tên class/method ra client (xem `error-handling-conventions.mdc`).
   */
  async getNextDrawNoBatch(drawDate: string, count: number): Promise<number> {
    const result = await this.findOneAndUpdate(
      { drawDate },
      { $inc: { lastDrawNo: count } },
      { upsert: true, returnDocument: "after" },
    );

    if (!result) {
      throw AppException.internal("Không thể sinh số kỳ quay, vui lòng thử lại.");
    }

    return result.lastDrawNo - count + 1;
  }
}
