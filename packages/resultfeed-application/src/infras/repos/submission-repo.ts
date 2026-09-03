/**
 * ResultFeed – Submission Repository
 *
 * Collection: `submissions`. Bằng chứng thô — BẤT BIẾN sau khi ghi (bodyGz/contentHash/requestUrl
 * chỉ ghi ở `$setOnInsert`, không có method update). Chỉ `state`/`failureReason` và bộ đếm quan
 * sát lại (`seenCount`/`lastSeenAt`/`lastRequestUrl`) được cập nhật về sau.
 */

import { docPath } from "@megawin/data/mongo";
import type {
  ResultFeedGameKey,
  ResultFeedSourceId,
  SubmissionDoc,
  SubmissionEntity,
} from "@megawin/resultfeed/entities";
import { SubmissionState } from "@megawin/resultfeed/entities";
import { AppException } from "@megawin/shared/errors";
import { logError } from "@megawin/shared/utils";

import { SubmissionMapper } from "../mappers/submission-mapper";
import { BaseRepo } from "./base-repo";

const f = docPath<SubmissionDoc>();

export class SubmissionRepository extends BaseRepo<SubmissionEntity, SubmissionMapper> {
  constructor() {
    super({ collName: "submissions", dataMapper: new SubmissionMapper() });
  }

  /**
   * Ghi bằng chứng thô — **idempotent theo `{sourceId, contentHash}`** (khớp unique index).
   *
   * Vì sao upsert chứ không `insertOne` append-only: unique index `{sourceId, contentHash}`
   * là chủ đích (không nhân bản 200KB HTML giống nhau), nhưng site/vendor trả **cùng một
   * trang** cho nhiều request khác nhau là chuyện BÌNH THƯỜNG và xảy ra **nhiều nhất đúng
   * lúc sự cố** (trang block Cloudflare, trang "kỳ không tồn tại", trang bị cache). Nếu
   * insert thuần thì lần thứ hai throw duplicate key 11000 và làm sập worker **trước khi**
   * kịp ghi alert — tức cơ chế "lưu bằng chứng trước" tự chặn chính nó ở đúng tình huống
   * cần bằng chứng nhất.
   *
   * Bytes đã có ⇒ chỉ `$inc seenCount` + cập nhật `lastSeenAt`/`lastRequestUrl`. Các field
   * bằng chứng (`bodyGz`/`contentHash`/`requestUrl`/`fetchedAt`) chỉ ghi ở `$setOnInsert`
   * ⇒ bất biến theo thiết kế, upsert KHÔNG phá tính bằng chứng.
   *
   * `state` cố ý nằm trong `$setOnInsert`: một bytes đã `parsed` không được tụt về `fetched`
   * chỉ vì có request khác nhận lại đúng bytes đó (nếu không sẽ bị TTL retention lỡ nhịp).
   */
  async upsertSubmission(
    doc: Omit<SubmissionDoc, "_id" | "seenCount" | "lastSeenAt" | "lastRequestUrl">,
  ): Promise<string> {
    const { sourceId, contentHash, requestUrl, fetchedAt, ...rest } = doc;
    const result = await this.findOneAndUpdate(
      { [f("sourceId")]: sourceId, [f("contentHash")]: contentHash },
      {
        $setOnInsert: {
          [f("sourceId")]: sourceId,
          [f("contentHash")]: contentHash,
          [f("requestUrl")]: requestUrl,
          [f("fetchedAt")]: fetchedAt,
          ...rest,
        },
        $inc: { [f("seenCount")]: 1 },
        $set: {
          [f("lastSeenAt")]: fetchedAt,
          [f("lastRequestUrl")]: requestUrl,
        },
      },
      { upsert: true, returnDocument: "after" },
    );
    if (!result) {
      logError("SubmissionRepository.upsertSubmission", new Error("findOneAndUpdate upsert trả về null"), {
        sourceId,
        contentHash,
      });
      throw AppException.internal("Không thể lưu bằng chứng thu thập kết quả, vui lòng thử lại.");
    }
    return result.id;
  }

  /**
   * Tra bằng chứng theo bytes — dùng cho trang vận hành ("bytes này đã thấy bao nhiêu lần").
   * KHÔNG cần gọi trước `upsertSubmission`: dedupe đã nằm trong chính lệnh upsert (nguyên tử),
   * gọi thêm ở đây chỉ tạo race giữa check và write.
   */
  async findByContentHash(sourceId: ResultFeedSourceId, contentHash: string): Promise<SubmissionEntity | null> {
    return await this.findOne({
      [f("sourceId")]: sourceId,
      [f("contentHash")]: contentHash,
    });
  }

  /** Đánh dấu đã parse xong thành công. */
  async markParsed(id: string): Promise<boolean> {
    return await this.updateById(id, {
      $set: {
        [f("state")]: SubmissionState.Parsed,
        [f("failureReason")]: null,
      },
    });
  }

  /** Đánh dấu parse lỗi — giữ lại bằng chứng để sửa parser, KHÔNG bị TTL retention xoá. */
  async markParseFailed(id: string, reason: string): Promise<boolean> {
    return await this.updateById(id, {
      $set: {
        [f("state")]: SubmissionState.ParseFailed,
        [f("failureReason")]: reason,
      },
    });
  }

  /**
   * Đánh dấu "kỳ chưa có kết quả" (`ResultUnavailableError`, best-effort — xem
   * `vietlott-detail/dom-helpers.ts`) — KHÔNG phải lỗi parser, chỉ là mốc dữ liệu chưa xuất
   * hiện. Khác `markParseFailed`: state này bị TTL retention xoá sau 30 ngày như `parsed`
   * (xem `indexes/index.ts`) — nếu không, mỗi lần worker chạm mép dữ liệu thật (bình
   * thường, xảy ra liên tục) sẽ tích lũy submission vô thời hạn.
   */
  async markUnavailable(id: string, reason: string): Promise<boolean> {
    return await this.updateById(id, {
      $set: {
        [f("state")]: SubmissionState.Unavailable,
        [f("failureReason")]: reason,
      },
    });
  }

  /** Hàng đợi parse lại — submission đã fetch nhưng parse thất bại. */
  async findParseFailedQueue(limit = 50): Promise<SubmissionEntity[]> {
    return await this.findMany({ [f("state")]: SubmissionState.ParseFailed }, { sort: { [f("fetchedAt")]: 1 }, limit });
  }

  /** Trang vận hành xem log submission gần đây theo game. */
  async findRecentByGameKey(gameKey: ResultFeedGameKey, limit = 50): Promise<SubmissionEntity[]> {
    return await this.findMany({ [f("gameKey")]: gameKey }, { sort: { [f("fetchedAt")]: -1 }, limit });
  }
}
