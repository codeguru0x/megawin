/**
 * Bingo 18 – Draw Account Stats (tích luỹ cược theo account trong 1 kỳ)
 *
 * Collection: bingo18_draw_account_stats — 1 document / (draw × account).
 *
 * ## Vì sao cần collection riêng thay vì mảng `topAccounts` trong stats doc?
 *
 * `topAccounts` là top-K theo metric **TÍCH LUỸ** (`amount` cộng dồn). Nuôi bằng cách seed
 * lại top-K từ stats doc mỗi tick → account rơi khỏi top-K **mất toàn bộ lịch sử**, lần
 * cược sau tính lại từ 0 → tổng hụt, xếp hạng sai, **sai số tỷ lệ thuận số người chơi** và
 * không tự sửa (H10 phần "vì sao topAccounts phải ra ngoài").
 *
 * Sửa gốc: mọi account đều có doc riêng, ghi bằng `$inc` upsert (không RMW, idempotent theo
 * watermark). `topAccounts` derive bằng `sort({amount:-1}).limit(K)` trên index → **chính
 * xác tuyệt đối**, không phụ thuộc K, không cần recompute lúc đóng bán.
 *
 * Nguyên tắc chung: **top-K theo metric bất biến per-item thì an toàn; top-K theo metric
 * tích luỹ thì KHÔNG** — phải nuôi từ nguồn đầy đủ rồi mới lấy top-K khi đọc
 * (`mongodb.mdc` §8).
 *
 * Bonus: đây cũng là nguồn cho "outstanding theo player/kỳ" mà UI alert `large_bet` cần
 * link tới — không phải aggregate lại từ entries.
 *
 * ## Retention
 *
 * TTL index `{ createdAt: 1 }, expireAfterSeconds` 90 ngày (tạo thủ công theo
 * `BINGO18_INDEXES` — xem `mongodb.mdc` §7). KHÔNG cleanup batch trong app.
 */

import type { DeltaAccumulatedDoc } from "@megawin/game-core/types";

/**
 * Tích luỹ cược của 1 account trong 1 kỳ.
 *
 * Mọi field số đều cộng dồn bằng `$inc` — KHÔNG bao giờ `$set` (tránh lost-update và
 * loại bỏ nhu cầu đọc baseline trước khi ghi). Idempotent nhờ watermark per-doc, xem
 * {@link DeltaAccumulatedDoc}.
 */
export interface Bingo18DrawAccountStatsDoc extends DeltaAccumulatedDoc {
  /** MongoDB ObjectId. */
  _id: unknown;
  /** drawId dạng `YYYY-MM-DD.NNN`. */
  drawId: string;
  /** ID account. Unique cùng `drawId`. */
  accountId: string;
  /**
   * Username snapshot mới nhất thấy trong entry (ưu tiên hiển thị trước `accountId`).
   *
   * Đây là field DUY NHẤT dùng `$set` (ghi đè bằng giá trị mới nhất) — các field số dùng
   * `$inc`. Rỗng `""` khi entry không có username snapshot → UI fallback về `accountId`.
   */
  username: string;
  /** Tổng tiền cược của account trong kỳ (VND). */
  amount: number;
  /** Số entry của account trong kỳ. */
  entries: number;
  /** Tổng số bộ cược `Σ(board.betCount)` của account trong kỳ (KHÔNG phải số board). */
  sets: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Application-layer entity sau khi qua mapper. ObjectId → id string. */
export interface Bingo18DrawAccountStatsEntity extends Omit<Bingo18DrawAccountStatsDoc, "_id"> {
  /** MongoDB ObjectId đã chuyển sang hex string. */
  id: string;
}
