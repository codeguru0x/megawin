/**
 * Keno – Draw Counter Document
 *
 * Collection: keno_draw_counters
 *
 * Mỗi document = 1 ngày, lưu drawNo lớn nhất đã cấp trong ngày đó.
 * Dùng atomic $inc để đảm bảo drawNo unique khi concurrent requests.
 *
 * Collection chỉ có ~365 docs/năm → luôn nhỏ gọn.
 */

/**
 * Document lưu trữ sequence drawNo cho 1 ngày.
 *
 * ATOMIC COUNTER: Dùng `$inc` với `upsert: true` để đảm bảo drawNo
 * unique và không bị race condition khi nhiều requests chạy đồng thời.
 *
 * Pattern:
 * ```ts
 * const result = await drawCounters.findOneAndUpdate(
 *   { drawDate },
 *   { $inc: { lastDrawNo: 1 } },
 *   { upsert: true, returnDocument: "after" },
 * );
 * const drawNo = result.lastDrawNo; // Guaranteed unique
 * ```
 */
export interface DrawCounterDoc {
  _id: unknown;

  /** Ngày quay "YYYY-MM-DD" – unique index. */
  drawDate: string;

  /** DrawNo lớn nhất đã cấp trong ngày. */
  lastDrawNo: number;
}

/** Application-layer entity sau khi qua mapper. ObjectId → id string. */
export interface DrawCounterEntity extends Omit<DrawCounterDoc, "_id"> {
  /** MongoDB ObjectId đã chuyển sang hex string. */
  id: string;
}
