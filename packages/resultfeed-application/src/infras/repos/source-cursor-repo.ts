/**
 * ResultFeed – Source Cursor Repository
 *
 * Collection: `source_cursors`. Trạng thái lịch fetch — nơi worker biết fetch kỳ nào tiếp theo
 * mà không cần quét trang list mỗi lần (dự đoán `nextExpectedPeriod`).
 */

import { docPath } from "@megawin/data/mongo";
import type {
  ResultFeedGameKey,
  ResultFeedSourceId,
  SourceCursorDoc,
  SourceCursorEntity,
} from "@megawin/resultfeed/entities";

import { SourceCursorMapper } from "../mappers/source-cursor-mapper";
import { BaseRepo } from "./base-repo";

const f = docPath<SourceCursorDoc>();

export class SourceCursorRepository extends BaseRepo<SourceCursorEntity, SourceCursorMapper> {
  constructor() {
    super({ collName: "source_cursors", dataMapper: new SourceCursorMapper() });
  }

  /** 1 cursor / nguồn / game — khớp unique index `{sourceId, gameKey}`. */
  async findBySourceAndGameKey(
    sourceId: ResultFeedSourceId,
    gameKey: ResultFeedGameKey,
  ): Promise<SourceCursorEntity | null> {
    return await this.findOne({
      [f("sourceId")]: sourceId,
      [f("gameKey")]: gameKey,
    });
  }

  /**
   * Đảm bảo có cursor cho 1 nguồn × game (tạo mới nếu chưa có) — idempotent. Cursor mới bắt
   * đầu `nextFetchAt = now` (fetch ngay lượt tick tới), chưa biết kỳ nào ⇒ `null`.
   */
  async ensureCursor(sourceId: ResultFeedSourceId, gameKey: ResultFeedGameKey): Promise<void> {
    await this.updateOne(
      { [f("sourceId")]: sourceId, [f("gameKey")]: gameKey },
      {
        $setOnInsert: {
          [f("lastConfirmedPeriod")]: null,
          [f("nextExpectedPeriod")]: null,
          [f("nextFetchAt")]: new Date(),
          [f("consecutiveFailures")]: 0,
          [f("needsBackfill")]: false,
          [f("consecutiveIntrinsicFailures")]: 0,
          [f("isPaused")]: false,
          [f("updatedAt")]: new Date(),
        },
      },
      { upsert: true },
    );
  }

  /** Worker lấy việc đến hạn — `nextFetchAt <= now`. */
  async findDue(now: Date, limit = 100): Promise<SourceCursorEntity[]> {
    return await this.findMany({ [f("nextFetchAt")]: { $lte: now } }, { sort: { [f("nextFetchAt")]: 1 }, limit });
  }

  /**
   * Ghi nhận fetch THÀNH CÔNG: neo lại kỳ đã xác nhận, dự đoán kỳ kế tiếp, đặt lịch fetch kế
   * tiếp, reset failure counter (fetch thành công ⇒ đang đúng nhịp).
   *
   * KHÔNG đụng `needsBackfill` — 1 tick thành công giữa chuỗi backlog không có nghĩa đã hết
   * backlog (có thể còn nhiều kỳ nữa phía sau chưa lấy). Cờ này chỉ tắt ở `recordUnavailable`
   * (xác nhận đã chạm mép dữ liệu thật) hoặc `seedAnchor` (ops reset).
   */
  async recordSuccess(
    id: string,
    input: {
      lastConfirmedPeriod: string;
      nextExpectedPeriod: string;
      nextFetchAt: Date;
    },
  ): Promise<boolean> {
    return await this.updateById(id, {
      $set: {
        [f("lastConfirmedPeriod")]: input.lastConfirmedPeriod,
        [f("nextExpectedPeriod")]: input.nextExpectedPeriod,
        [f("nextFetchAt")]: input.nextFetchAt,
        [f("consecutiveFailures")]: 0,
        [f("updatedAt")]: new Date(),
      },
    });
  }

  /**
   * Neo kỳ khởi điểm THỦ CÔNG cho một cursor chưa từng có kỳ nào (`lastConfirmedPeriod === null`),
   * hoặc để người vận hành đặt lại điểm bắt đầu sau sự cố.
   *
   * Vì sao cần method này: nguồn mới thêm vào hệ thống chưa có `lastConfirmedPeriod` nào để
   * dự đoán +1 ⇒ phải có một đường nạp từ người, nếu không nguồn đó không bao giờ chạy được.
   * Đây là hành động VẬN HÀNH (đọc kỳ hiện tại trên site rồi nhập vào, hoặc suy ra từ dữ liệu
   * lịch sử đã import), không phải đường máy tự gọi trong pipeline `fetch-and-parse.ts` — caller
   * là API backoffice có audit HOẶC script vận hành chạy tay có DB access (VD
   * `scripts/seed-cursors-from-latest.ts` — seed hàng loạt sau khi import lịch sử JSONL).
   *
   * `consecutiveFailures` reset về 0: seed là một khởi động sạch, không mang theo backoff của
   * chuỗi lỗi trước đó. `needsBackfill` cũng reset về `false` — ops đã xác nhận kỳ khởi điểm
   * đúng, không có backlog cần đuổi kịp từ đây. `isPaused` + `consecutiveIntrinsicFailures`
   * cũng reset — seed là hành động ops đã xác nhận thủ công lại kỳ đúng, coi như đã xử lý xong
   * nghi vấn parser đọc sai (nếu có).
   */
  async seedAnchor(
    sourceId: ResultFeedSourceId,
    gameKey: ResultFeedGameKey,
    input: { lastConfirmedPeriod: string; nextExpectedPeriod: string },
  ): Promise<boolean> {
    return await this.updateOne(
      { [f("sourceId")]: sourceId, [f("gameKey")]: gameKey },
      {
        $set: {
          [f("lastConfirmedPeriod")]: input.lastConfirmedPeriod,
          [f("nextExpectedPeriod")]: input.nextExpectedPeriod,
          [f("nextFetchAt")]: new Date(),
          [f("consecutiveFailures")]: 0,
          [f("needsBackfill")]: false,
          [f("consecutiveIntrinsicFailures")]: 0,
          [f("isPaused")]: false,
          [f("updatedAt")]: new Date(),
        },
      },
    );
  }

  /**
   * Ghi nhận tick chạm "kỳ chưa có kết quả" (`ResultUnavailableError`) — KHÔNG phải thất
   * bại, KHÔNG đổi `lastConfirmedPeriod`/`nextExpectedPeriod` (kỳ đó vẫn chưa xác nhận được
   * gì). Reset `consecutiveFailures` về 0 vì đây không phải lỗi liên tiếp cần backoff —
   * nếu tính vào backoff, hiện tượng bình thường (poll sát mép dữ liệu thật) sẽ bị trì hoãn
   * lịch fetch oan như một sự cố thật.
   *
   * Cũng reset `needsBackfill` về `false` — chạm "chưa có kết quả" là XÁC NHẬN đã đuổi tới
   * đúng mép dữ liệu hiện tại, không còn kỳ nào để lấy thêm ⇒ tắt cờ burst cho tick-loop kế
   * tiếp (`FetchAndParseUseCase.beforeLoop` đọc cờ này để quyết định `burstEnabled`).
   *
   * Đây cũng chính là TÍN HIỆU DỪNG cho tick-loop backfill (`fetch-and-parse.ts`): gặp
   * "chưa có kết quả" nghĩa là đã đuổi tới đúng mép dữ liệu hiện tại, không còn kỳ nào để
   * lấy thêm trong lượt này.
   */
  async recordUnavailable(id: string, nextFetchAt: Date): Promise<boolean> {
    return await this.updateById(id, {
      $set: {
        [f("nextFetchAt")]: nextFetchAt,
        [f("consecutiveFailures")]: 0,
        [f("needsBackfill")]: false,
        [f("updatedAt")]: new Date(),
      },
    });
  }

  /**
   * Ghi nhận fetch THẤT BẠI — dùng cho **mọi** loại thất bại, không chỉ lỗi transport:
   * `fetch_failed`, `parse_failed`, và `awaiting_seed` (cold start chưa từng seed kỳ khởi
   * điểm). `period_gap` KHÔNG đi qua đây nữa — lệch kỳ giờ tự heal qua `recordSuccess` (coi
   * kỳ thực tế là anchor mới), không phải sự cố cần backoff.
   *
   * Vì sao gộp: `consecutiveFailures` là cơ sở của backoff + alert leo thang. Nếu chỉ tăng
   * khi `fetchResult.ok === false` thì trường hợp phổ biến nhất lúc site sự cố — provider trả
   * `200` kèm trang rỗng/trang block (parse lỗi) — sẽ giữ counter = 0 ⇒ **không có backoff**,
   * worker gọi lại cùng URL mỗi phút cho một câu trả lời không bao giờ đổi.
   *
   * `needsBackfill` LUÔN set `true` ở đây — CHÍNH TAY worker xác nhận có sự cố thật (không suy
   * luận qua so sánh thời gian, tránh lệch đồng hồ máy chủ hay hiểu sai cold-start thành
   * outage). Cờ này là điều kiện DUY NHẤT cho phép `FetchAndParseUseCase` bật vòng lặp nhiều
   * tick/invocation (`burstEnabled`) — chỉ tắt lại khi `recordUnavailable` xác nhận đã đuổi kịp
   * mép dữ liệu thật, hoặc ops `seedAnchor`.
   */
  async recordFailure(id: string, input: { nextFetchAt: Date }): Promise<boolean> {
    return await this.updateById(id, {
      $inc: { [f("consecutiveFailures")]: 1 },
      $set: {
        [f("nextFetchAt")]: input.nextFetchAt,
        [f("needsBackfill")]: true,
        [f("updatedAt")]: new Date(),
      },
    });
  }

  /**
   * Ops đặt CHỦ ĐỘNG `needsBackfill` — dùng cho sự cố KHÔNG đi qua đường tự động của
   * `recordFailure` (VD: consensus phát hiện lệch dữ liệu ở nguồn này nên cần fetch lại,
   * hoặc ops biết trước sắp có gián đoạn và muốn bật catch-up ngay khi worker chạy lại lượt
   * kế tiếp). Đây là hành động VẬN HÀNH có audit — giống `seedAnchor` — không phải đường máy
   * tự gọi trong pipeline `fetch-and-parse.ts`.
   *
   * KHÔNG đụng `consecutiveFailures`/`nextFetchAt`/`lastConfirmedPeriod` — chỉ đổi đúng 1 cờ,
   * để ops có thể bật/tắt catch-up mà không ảnh hưởng lịch chạy hay tiến độ đã xác nhận.
   */
  async markNeedsBackfill(id: string, needsBackfill: boolean): Promise<boolean> {
    return await this.updateById(id, {
      $set: {
        [f("needsBackfill")]: needsBackfill,
        [f("updatedAt")]: new Date(),
      },
    });
  }

  /**
   * Ghi nhận `checkIntrinsic` trả về `Failed` cho tick vừa chạy —
   * `consecutiveIntrinsicFailures` do CALLER tính sẵn (đọc `cursor.consecutiveIntrinsicFailures`
   * hiện tại rồi +1, xem `INTRINSIC_FAILURE_PAUSE_THRESHOLD` ở `fetch-and-parse.ts`) — repo
   * không tự tính để tránh 1 request DB đọc-lại-rồi-ghi khi use-case đã sẵn giá trị cursor
   * trong tay.
   *
   * `pause = true` ⇒ đồng thời set `isPaused = true` — cũng set `needsBackfill = true`, vì
   * khi ops resume chắc chắn có backlog tích lại trong lúc dừng, cần burst catch-up ngay.
   */
  async recordIntrinsicFailure(
    id: string,
    input: { consecutiveIntrinsicFailures: number; pause: boolean },
  ): Promise<boolean> {
    const $set: Record<string, unknown> = {
      [f("consecutiveIntrinsicFailures")]: input.consecutiveIntrinsicFailures,
      [f("updatedAt")]: new Date(),
    };
    if (input.pause) {
      $set[f("isPaused")] = true;
      $set[f("needsBackfill")] = true;
    }
    return await this.updateById(id, { $set });
  }

  /**
   * Ghi nhận `checkIntrinsic` trả về `Passed`/`NotAvailable` — reset `consecutiveIntrinsicFailures`
   * về 0. KHÔNG đụng `isPaused` — nếu đang paused thì tick này không thể chạm tới đây (gate ở đầu
   * `fetchAndParseOnce` đã chặn trước khi fetch), giữ nguyên để tường minh không phụ thuộc thứ tự gọi.
   */
  async recordIntrinsicPassed(id: string): Promise<boolean> {
    return await this.updateById(id, {
      $set: {
        [f("consecutiveIntrinsicFailures")]: 0,
        [f("updatedAt")]: new Date(),
      },
    });
  }

  /**
   * Đẩy lịch retry khi nguồn ĐANG paused (`isPaused = true`) — CHỈ ghi `nextFetchAt`, không
   * đụng `consecutiveFailures`/`needsBackfill`/counter nào khác. Tách riêng khỏi `recordFailure`
   * vì bản chất khác nhau: `recordFailure` là bằng chứng CÓ sự cố (tăng backoff); paused là
   * TRẠNG THÁI đã biết sự cố, đang chờ người xử lý — gọi lại tick sau chỉ để kiểm tra `isPaused`
   * còn `true` hay chưa, không phải một lần thất bại mới.
   */
  async schedulePausedRetry(id: string, nextFetchAt: Date): Promise<boolean> {
    return await this.updateById(id, {
      $set: {
        [f("nextFetchAt")]: nextFetchAt,
        [f("updatedAt")]: new Date(),
      },
    });
  }

  /**
   * Ops xác nhận đã xử lý xong nghi vấn "parser đọc sai" (đối chiếu vài kỳ gần nhất với site
   * gốc bằng tay, hoặc đã deploy fix) — cho phép nguồn này fetch tiếp ngay tick kế tiếp
   * (`nextFetchAt = now`). Reset `isPaused` + `consecutiveIntrinsicFailures`; KHÔNG đụng
   * `needsBackfill` (đang `true` từ lúc pause, giữ nguyên để burst catch-up chạy ngay khi resume
   * — chắc chắn có backlog tích lại trong lúc dừng). Hành động VẬN HÀNH có audit — giống
   * `seedAnchor`/`markNeedsBackfill` — không phải đường máy tự gọi.
   */
  async resumeFromPause(id: string): Promise<boolean> {
    return await this.updateById(id, {
      $set: {
        [f("isPaused")]: false,
        [f("consecutiveIntrinsicFailures")]: 0,
        [f("nextFetchAt")]: new Date(),
        [f("updatedAt")]: new Date(),
      },
    });
  }
}
