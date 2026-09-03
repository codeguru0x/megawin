/**
 * ResultFeed – Submission (raw evidence)
 *
 * Collection: `submissions`
 *
 * 1 document = 1 **bytes duy nhất** đã fetch được (khoá theo `{sourceId, contentHash}`) —
 * bằng chứng BẤT BIẾN sau khi ghi. Fetch lại ra ĐÚNG bytes cũ ⇒ `$inc seenCount`, không
 * sinh doc mới (unique index chặn, và đó là hành vi mong muốn: không nhân bản 200KB HTML
 * giống nhau). Không normalize/prettify trước khi lưu — mất tính bằng chứng và làm
 * `contentHash` vô nghĩa. `parserVersion` KHÔNG nằm ở đây (đó là field của `observations` —
 * 1 submission có thể được parse lại nhiều lần bởi các parser version khác nhau).
 */

import type { Binary } from "mongodb";

import type { ResultFeedGameKey, ResultFeedProviderId, ResultFeedSourceId, SubmissionState } from "./enums";

export interface SubmissionDoc {
  _id: unknown;

  sourceId: ResultFeedSourceId;

  /** Game mà request này NHẮM tới. Null nếu là trang list đa game. */
  gameKey: ResultFeedGameKey | null;

  /** URL đầy đủ đã gọi (gồm cả cache-buster) — cần cho tái hiện chính xác. */
  requestUrl: string;

  httpStatus: number;

  /** `text/html` | `application/json` | … — parser dựa vào đây để chọn cách đọc. */
  contentType: string;

  /**
   * Raw bytes NGUYÊN VĂN, đã gzip. HTML nén ~8–10× (~200KB → ~25KB).
   * TUYỆT ĐỐI không normalize/prettify trước khi lưu.
   */
  bodyGz: Binary;

  /** `sha256` của body TRƯỚC khi gzip. Khoá dedupe + đối chiếu cross-provider. */
  contentHash: string;

  /** Kích thước body gốc (bytes) — theo dõi HTML nguồn phình/đổi bất thường. */
  bodyBytes: number;

  providerId: ResultFeedProviderId;

  elapsedMs: number;

  state: SubmissionState;

  /** Lý do khi `fetch_failed`/`parse_failed` — text cho vận hành đọc. */
  failureReason: string | null;

  /** Thời điểm fetch LẦN ĐẦU ra bytes này. Anchor của TTL retention — không đổi về sau. */
  fetchedAt: Date;

  /**
   * Số lần fetch trả về ĐÚNG bytes này (unique key `{sourceId, contentHash}` nên bytes
   * trùng không sinh doc mới — xem `SubmissionRepository.upsertSubmission`).
   *
   * Giá trị > 1 là **tín hiệu vận hành thật**, không phải rác: site/vendor đang trả cùng
   * một trang cho nhiều request khác nhau ⇒ hoặc bị cache (`nocatche` không có tác dụng),
   * hoặc đang trả trang block/lỗi cố định. Đó chính là hình dạng của một sự cố kéo dài.
   */
  seenCount: number;

  /** Thời điểm GẦN NHẤT bytes này được trả về. Bằng `fetchedAt` khi `seenCount === 1`. */
  lastSeenAt: Date;

  /**
   * URL của lần fetch GẦN NHẤT trả ra bytes này — khác `requestUrl` (lần đầu) khi nhiều
   * kỳ khác nhau đều nhận cùng một trang lỗi. Không có field này thì log vận hành chỉ
   * thấy URL đầu tiên và không hiểu vì sao `seenCount` lớn.
   */
  lastRequestUrl: string;
}

/** Application-layer entity sau khi qua mapper. ObjectId → id string. */
export interface SubmissionEntity extends Omit<SubmissionDoc, "_id"> {
  /** MongoDB ObjectId đã chuyển sang hex string. */
  id: string;
}
