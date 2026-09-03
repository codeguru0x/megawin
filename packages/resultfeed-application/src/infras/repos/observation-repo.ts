/**
 * ResultFeed – Observation Repository
 *
 * Collection: `observations`. Truy vấn "kỳ này các nguồn nói gì" phải là MỘT query có index —
 * đây là lý do tầng này tách khỏi `submissions` (raw HTML).
 */

import { docPath } from "@megawin/data/mongo";
import type { ObservationDoc, ObservationEntity, ResultFeedGameKey } from "@megawin/resultfeed/entities";
import type { AnyBulkWriteOperation, BulkWriteResult, Document } from "mongodb";

import { ObservationMapper } from "../mappers/observation-mapper";
import { BaseRepo } from "./base-repo";

const f = docPath<ObservationDoc>();

export class ObservationRepository extends BaseRepo<ObservationEntity, ObservationMapper> {
  constructor() {
    super({ collName: "observations", dataMapper: new ObservationMapper() });
  }

  /**
   * Ghi observation — idempotent theo unique key `{sourceId, gameKey, drawPeriod, parserVersion}`.
   *
   * Parse lại CÙNG `parserVersion` cho cùng submission → upsert khớp doc cũ, `$set` ghi đè (no-op
   * về mặt dữ liệu nếu nội dung không đổi). Bump `parserVersion` → khoá khác → bản ghi MỚI, giữ
   * lại bản cũ để so sánh trước/sau khi đổi parser.
   */
  async upsertObservation(doc: Omit<ObservationDoc, "_id" | "createdAt" | "updatedAt">): Promise<boolean> {
    const now = new Date();
    return await this.updateOne(
      {
        [f("sourceId")]: doc.sourceId,
        [f("gameKey")]: doc.gameKey,
        [f("drawPeriod")]: doc.drawPeriod,
        [f("parserVersion")]: doc.parserVersion,
      },
      {
        $set: {
          [f("drawDateSource")]: doc.drawDateSource,
          [f("drawTimeSource")]: doc.drawTimeSource,
          [f("numbersDisplay")]: doc.numbersDisplay,
          [f("numbersCanonical")]: doc.numbersCanonical,
          [f("displayHash")]: doc.displayHash,
          [f("payoutHash")]: doc.payoutHash,
          [f("claimedChecksums")]: doc.claimedChecksums,
          [f("intrinsicState")]: doc.intrinsicState,
          [f("intrinsicMismatch")]: doc.intrinsicMismatch,
          [f("submissionId")]: doc.submissionId,
          // Ghi MỖI LẦN chạy (kể cả nội dung không đổi) — đây là cursor cho
          // ConsensusTickUseCase.findChangedSince, không phải "lần sửa nội dung cuối".
          [f("updatedAt")]: now,
        },
        $setOnInsert: {
          [f("createdAt")]: now,
        },
      },
      { upsert: true },
    );
  }

  /**
   * Observation đã đổi (ghi/upsert) SAU `since` — cursor cho `ConsensusTickUseCase`. Dùng
   * `$gt` (không `$gte`) — cùng lý do `evaluate-ops-alerts.ts` của Keno: mất tối đa các
   * doc trùng-ms-với-cursor trong CÙNG lần đọc đã xử lý, doc mới trùng ms sẽ có
   * `updatedAt` mới hơn khi tick kế tiếp chạy → tự được quét, không sót vĩnh viễn.
   */
  async findChangedSince(since: Date, limit: number): Promise<ObservationEntity[]> {
    return await this.findMany({ [f("updatedAt")]: { $gt: since } }, { sort: { [f("updatedAt")]: 1 }, limit });
  }

  /** Query nóng của consensus: toàn bộ observation các nguồn đã ghi cho 1 game × 1 kỳ. */
  async findByGameKeyAndPeriod(gameKey: ResultFeedGameKey, drawPeriod: string): Promise<ObservationEntity[]> {
    return await this.findMany({
      [f("gameKey")]: gameKey,
      [f("drawPeriod")]: drawPeriod,
    });
  }

  /** Trang vận hành: observation gần đây theo game. */
  async findRecentByGameKey(gameKey: ResultFeedGameKey, limit = 50): Promise<ObservationEntity[]> {
    return await this.findMany({ [f("gameKey")]: gameKey }, { sort: { [f("createdAt")]: -1 }, limit });
  }

  /**
   * Đọc lại `id` (Mongo ObjectId hex) của 1 batch `drawPeriod` VỪA `bulkUpsertObservations` —
   * dùng cho script import lịch sử (`06-historical-import.plan.md §3.3`) để điền
   * `ConsensusAgreement.observationId` THẬT (không phải chuỗi rỗng giả) trước khi gọi
   * `ConsensusRepository.bulkUpsertPublished`. `bulkWrite` KHÔNG trả `_id` cho doc đã tồn tại
   * (chỉ có trong `upsertedIds` khi insert mới) — phải query lại theo khoá thay vì tin kết quả
   * `bulkWrite`.
   */
  async findByKeysForImport(
    sourceId: ObservationDoc["sourceId"],
    gameKey: ResultFeedGameKey,
    parserVersion: string,
    drawPeriods: readonly string[],
  ): Promise<ObservationEntity[]> {
    return await this.findMany({
      [f("sourceId")]: sourceId,
      [f("gameKey")]: gameKey,
      [f("parserVersion")]: parserVersion,
      [f("drawPeriod")]: { $in: [...drawPeriods] },
    });
  }

  /**
   * Ghi HÀNG LOẠT observation — dùng cho import dữ liệu lịch sử
   * (`06-historical-import.plan.md §3.3`), KHÔNG dùng cho pipeline fetch sống (đó vẫn đi qua
   * `upsertObservation` single-doc, 1 kỳ/lần).
   *
   * Idempotent theo CÙNG unique key `{sourceId, gameKey, drawPeriod, parserVersion}` —
   * `$set` full-field cho MỌI field dữ liệu (KHÔNG dùng `$setOnInsert` cho field dữ liệu).
   * Đây là điều kiện BẮT BUỘC: script import có thể chạy lại nhiều lần sau khi sửa file
   * JSONL nguồn (data lỗi được fix) — `$set` đảm bảo lần chạy lại ghi đè giá trị MỚI;
   * `$setOnInsert` sẽ bỏ sót update và giữ giá trị SAI cũ nếu doc đã tồn tại.
   *
   * `ordered: false` — 1 doc lỗi (VD duplicate key hiếm gặp) không chặn cả batch còn lại.
   */
  async bulkUpsertObservations(
    docs: Array<Omit<ObservationDoc, "_id" | "createdAt" | "updatedAt">>,
  ): Promise<BulkWriteResult> {
    const now = new Date();
    const operations: AnyBulkWriteOperation<Document>[] = docs.map((doc) => ({
      updateOne: {
        filter: {
          [f("sourceId")]: doc.sourceId,
          [f("gameKey")]: doc.gameKey,
          [f("drawPeriod")]: doc.drawPeriod,
          [f("parserVersion")]: doc.parserVersion,
        },
        update: {
          $set: {
            [f("drawDateSource")]: doc.drawDateSource,
            [f("drawTimeSource")]: doc.drawTimeSource,
            [f("numbersDisplay")]: doc.numbersDisplay,
            [f("numbersCanonical")]: doc.numbersCanonical,
            [f("displayHash")]: doc.displayHash,
            [f("payoutHash")]: doc.payoutHash,
            [f("claimedChecksums")]: doc.claimedChecksums,
            [f("intrinsicState")]: doc.intrinsicState,
            [f("intrinsicMismatch")]: doc.intrinsicMismatch,
            [f("submissionId")]: doc.submissionId,
            [f("updatedAt")]: now,
          },
          $setOnInsert: {
            [f("createdAt")]: now,
          },
        },
        upsert: true,
      },
    }));
    return await this.bulkWrite(operations, { ordered: false });
  }
}
