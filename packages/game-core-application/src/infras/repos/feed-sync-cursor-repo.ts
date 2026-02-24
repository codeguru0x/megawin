import { Long } from "mongodb";
import { GameCoreCollections } from "@megawin/game-core/entities";
import type { GameProduct } from "@megawin/game-core/entities";
import type { BaseEntity } from "@megawin/data/mongo/base-entity";
import { GameCoreBaseRepo } from "./game-core-base-repo";

/**
 * Repository cho collection feedSyncCursor.
 *
 * Mỗi game product 1 document – lưu version cuối cùng đã sync
 * vào entryFeed. Worker đọc cursor trước khi chạy step function,
 * ghi lại sau khi sync hoàn tất.
 */
export class FeedSyncCursorRepository extends GameCoreBaseRepo<BaseEntity> {
  constructor() {
    super({ collName: GameCoreCollections.FeedSyncCursor });
  }

  /**
   * Lấy lastVersion đã sync cho game.
   * Trả "0" nếu chưa có document (lần đầu sync).
   */
  async getLastVersion(gameProduct: GameProduct): Promise<string> {
    const doc = await this.findOneAsDocument({ gameProduct });
    if (!doc) return "0";
    const v = doc.lastVersion as Long | undefined;
    return v ? v.toString() : "0";
  }

  /**
   * Cập nhật lastVersion sau khi sync batch hoàn tất.
   * Upsert: tạo document nếu chưa có.
   */
  async saveLastVersion(
    gameProduct: GameProduct,
    lastVersion: string,
  ): Promise<void> {
    await this.findOneAndUpdate(
      { gameProduct },
      {
        $set: {
          lastVersion: Long.fromString(lastVersion),
          updatedAt: new Date(),
        },
      },
      { upsert: true, returnDocument: "after" },
    );
  }
}
