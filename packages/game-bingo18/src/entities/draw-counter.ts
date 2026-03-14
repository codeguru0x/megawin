/**
 * Bingo 18 – Draw Counter Document
 *
 * Collection: bingo18_draw_counters
 *
 * Mỗi document = 1 ngày, lưu drawNo lớn nhất đã cấp trong ngày đó.
 * Dùng atomic $inc để đảm bảo drawNo unique khi concurrent requests.
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
