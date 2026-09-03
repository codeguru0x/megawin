/**
 * ResultFeed – Source Repository
 *
 * Collection: `sources`. Registry + config nguồn — sửa được qua backoffice, không cần deploy.
 */

import { docPath } from "@megawin/data/mongo";
import type { ResultFeedGameKey, ResultFeedSourceId, SourceDoc, SourceEntity } from "@megawin/resultfeed/entities";

import { SourceMapper } from "../mappers/source-mapper";
import { BaseRepo } from "./base-repo";

const f = docPath<SourceDoc>();

/** Field editable qua backoffice — KHÔNG gồm `sourceId` (khoá bất biến) hay timestamps. */
export type SourceEditableFields = Omit<SourceDoc, "_id" | "sourceId" | "createdAt" | "updatedAt">;

export class SourceRepository extends BaseRepo<SourceEntity, SourceMapper> {
  constructor() {
    super({ collName: "sources", dataMapper: new SourceMapper() });
  }

  /** Tra cứu 1 nguồn theo khoá ổn định `sourceId`. */
  async findBySourceId(sourceId: ResultFeedSourceId): Promise<SourceEntity | null> {
    return await this.findOne({ [f("sourceId")]: sourceId });
  }

  /** Toàn bộ nguồn đã đăng ký — trang quản lý backoffice. */
  async listAll(): Promise<SourceEntity[]> {
    return await this.findAll({ sort: { [f("sourceId")]: 1 } });
  }

  /**
   * Nguồn ĐANG BẬT phục vụ 1 game — worker dùng để biết cần fetch nguồn nào.
   * Nguồn tắt (`isEnabled = false`) không xuất hiện ở đây (kill-switch per source).
   */
  async findEnabledByGameKey(gameKey: ResultFeedGameKey): Promise<SourceEntity[]> {
    return await this.findMany({
      [f("gameKeys")]: gameKey,
      [f("isEnabled")]: true,
    });
  }

  /**
   * Tạo nguồn mới nếu chưa có, cập nhật field editable nếu đã có — idempotent theo `sourceId`.
   *
   * Đây là điểm ghi DUY NHẤT cho `role`/`trustWeight`/`isEnabled` — đổi giá trị này qua backoffice
   * là quyết định VẬN HÀNH nên caller (use-case) phải tự audit log, repo không tự làm.
   */
  async upsertBySourceId(sourceId: ResultFeedSourceId, fields: SourceEditableFields): Promise<boolean> {
    const now = new Date();
    return await this.updateOne(
      { [f("sourceId")]: sourceId },
      {
        $set: {
          [f("name")]: fields.name,
          [f("baseUrl")]: fields.baseUrl,
          [f("role")]: fields.role,
          [f("trustWeight")]: fields.trustWeight,
          [f("gameKeys")]: fields.gameKeys,
          [f("isEnabled")]: fields.isEnabled,
          [f("providerId")]: fields.providerId,
          [f("parserVersion")]: fields.parserVersion,
          [f("requiresRender")]: fields.requiresRender,
          [f("minIntervalMs")]: fields.minIntervalMs,
          [f("updatedAt")]: now,
        },
        $setOnInsert: {
          [f("createdAt")]: now,
        },
      },
      { upsert: true },
    );
  }
}
