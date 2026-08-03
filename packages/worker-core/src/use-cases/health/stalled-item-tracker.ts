/**
 * Theo dõi streak lỗi per-item của 1 worker trong lúc invocation đang chạy.
 *
 * Tách khỏi {@link SingleRunWorker} (composition, không kế thừa) — đây là concern
 * **observability**, không phải "lock". `SingleRunWorker` chỉ giữ 1 instance
 * `StalledItemTracker` và delegate `recordStalledItem`/`clearStalledItem` sang nó,
 * giữ nguyên chữ ký protected cho subclass — xem JSDoc `SingleRunWorker`.
 *
 * KHÔNG có I/O — chỉ đụng RAM. Owner (`SingleRunWorker.execute`) flush `snapshot()`
 * 1 lần duy nhất trong `finalizeAndRelease`, ghép vào lệnh update ĐÃ TỒN TẠI ở cuối
 * mọi invocation ⇒ **0 DB call thêm**, kể cả khi mọi item đều lỗi.
 */

import { truncateErrorMessage } from "@megawin/shared/utils";

import type { WorkerStalledItem } from "../../entities";

/**
 * Trần số item lưu trong `stalledItems` — VÀ trần số item giữ trong Map RAM
 * trong lúc invocation đang chạy.
 *
 * Sự cố diện rộng (mọi kỳ cùng lỗi vì Mongo nghẽn) sẽ sinh D entry — D có thể >100 với game
 * multi-draw. Cap để doc không phình; giữ item `failCount` cao nhất vì đó là item kẹt LÂU
 * nhất (đáng điều tra hơn item vừa lỗi lần đầu).
 *
 * Enforce ở 2 điểm, KHÔNG chỉ lúc persist:
 * - `record` — evict item `failCount` thấp nhất NGAY khi Map đầy, trước khi thêm
 *   item mới (xem `evictLowestFailCount`). Chặn Map phình vượt cap TRONG LÚC chạy.
 * - `snapshot()` — `.slice(0, MAX_STALLED_ITEMS)` là safety net cuối, về lý thuyết
 *   luôn no-op nếu enforce ở trên đúng (Map không bao giờ vượt cap), giữ lại để tránh
 *   1 defect tương lai làm phình doc DB.
 *
 * KHÔNG nâng lên số lớn (200, 1000) mà không tính lại doc size — cap là thứ DUY NHẤT giữ
 * mảng nhúng này hợp lệ với `mongodb.mdc` §8.1 (worst-case ~12KB ở cap = 20).
 */
const MAX_STALLED_ITEMS = 20;

/**
 * Ngưỡng `failCount` mặc định để BO coi item là "đáng chú ý".
 *
 * KHÔNG gây tác động tự động nào: không dừng worker, không skip item, không đổi retry —
 * chỉ là default filter của trang Workers health (cùng triết lý `RETRY_ALERT_THRESHOLD`
 * của tenant-dispatch, xem analysis §4).
 */
export const STALLED_ALERT_THRESHOLD = 3;

/**
 * Theo dõi streak lỗi per-item, merge với `stalledItems` đọc từ DB lúc acquire →
 * `failCount` tích luỹ liên tục qua các invocation.
 *
 * Instance mới per invocation (owner gọi `reset()` đầu `execute()`, TRƯỚC `seed()`) —
 * Lambda single-threaded, mỗi invocation có state riêng, giống giả định `_lockKey` ở
 * `SingleRunWorker`.
 */
export class StalledItemTracker {
  private items = new Map<string, WorkerStalledItem>();

  /**
   * Xoá toàn bộ streak RAM — gọi đầu mỗi invocation TRƯỚC `seed()`.
   *
   * BẮT BUỘC gọi ở đây (không phải constructor mới mỗi lần) để `SingleRunWorker` giữ
   * field `readonly` — Lambda container reuse giữ instance sống qua nhiều invocation,
   * không reset thì streak invocation trước rò rỉ sang invocation sau.
   */
  reset(): void {
    this.items = new Map();
  }

  /**
   * Seed streak từ DB — đọc TRƯỚC `tryAcquire` (owner đảm bảo thứ tự), tích luỹ
   * `failCount` liên tục qua các invocation thay vì reset mỗi lần.
   *
   * Mảng rỗng (worker chạy lần đầu, doc chưa tồn tại) → no-op, Map giữ rỗng từ `reset()`.
   */
  seed(existing: WorkerStalledItem[]): void {
    for (const item of existing) {
      this.items.set(item.itemKey, item);
    }
  }

  /**
   * Ghi nhận 1 đơn vị công việc vừa LỖI — cộng streak, giữ trong RAM.
   *
   * ## Không có I/O ⇒ KHÔNG THROW ⇒ caller KHÔNG bọc try/catch
   *
   * Đây là điểm thiết kế, không phải chi tiết. Bản trước (alert doc) phải bọc try/catch ở
   * mọi caller vì nó ghi DB — và chính try/catch đó từng gây 2 defect: nuốt lỗi mất-lock,
   * và nhảy qua `setCursor` làm mất tiến độ.
   *
   * Buffer ở đây là ĐÚNG (khác `setCursor` phải persist ngay): đây là tín hiệu quan sát,
   * mất nó không gây redo/sai số — kill cứng chỉ làm cảnh báo trễ ~1 invocation, và item kẹt
   * thật sẽ kẹt tiếp ở invocation sau.
   *
   * @param itemKey - Khoá đơn vị công việc (vd `drawId`). Cùng khoá = cùng streak.
   * @param error   - Lỗi vừa bắt; chỉ `message` được giữ (cắt 500 ký tự).
   */
  record(itemKey: string, error: unknown): void {
    const now = new Date();
    const existing = this.items.get(itemKey);

    if (existing) {
      existing.failCount += 1;
      existing.lastFailedAt = now;
      existing.lastError = truncateErrorMessage(error);
      // firstFailedAt GIỮ NGUYÊN — nó đo tuổi streak, ghi đè là mất thông tin quan trọng nhất.
      return;
    }

    // Item MỚI (key chưa từng lỗi trong invocation này). Nếu Map đã đầy MAX_STALLED_ITEMS,
    // loại item có failCount THẤP NHẤT trước khi thêm — chặn RAM phình vô hạn khi sự cố diện
    // rộng làm D >> MAX_STALLED_ITEMS item cùng lỗi lần đầu trong 1 invocation (VD Mongo nghẽn
    // làm mọi kỳ quay lỗi). Kết quả cuối KHÔNG đổi so với trước: `snapshot()` vẫn luôn chọn
    // top N theo failCount cao nhất — bước này chỉ ngăn Map vượt cap TRONG LÚC chạy, thay vì
    // chỉ cắt array ở thời điểm lưu.
    if (this.items.size >= MAX_STALLED_ITEMS) {
      this.evictLowestFailCount();
    }

    this.items.set(itemKey, {
      itemKey,
      failCount: 1,
      firstFailedAt: now,
      lastFailedAt: now,
      lastError: truncateErrorMessage(error),
    });
  }

  /**
   * Loại item có `failCount` THẤP NHẤT khỏi Map — gọi khi Map đã đầy `MAX_STALLED_ITEMS`
   * và cần thêm 1 item mới.
   *
   * O(cap) mỗi lần gọi (cap = 20, cực rẻ) — chỉ chạy khi Map ở đúng ngưỡng cap, không phải
   * mỗi lần `record`. Item mới luôn khởi tạo `failCount = 1` (thấp nhất có thể) nên nếu mọi
   * item hiện có đều `failCount > 1`, item bị loại chắc chắn KHÔNG phải item mới — đúng ý
   * định "giữ item kẹt LÂU nhất, loại item ít đáng điều tra nhất".
   */
  private evictLowestFailCount(): void {
    let lowestKey: string | undefined;
    let lowestFailCount = Number.POSITIVE_INFINITY;

    for (const [key, item] of this.items) {
      if (item.failCount < lowestFailCount) {
        lowestKey = key;
        lowestFailCount = item.failCount;
      }
    }

    if (lowestKey !== undefined) {
      this.items.delete(lowestKey);
    }
  }

  /**
   * Ghi nhận item xử lý THÀNH CÔNG — xoá khỏi danh sách kẹt (reset streak).
   *
   * Gọi sau MỖI item thành công, kể cả item chưa từng lỗi (no-op, rẻ). Nhờ vậy tín hiệu
   * TỰ TẮT khi hệ thống hồi phục — không ai phải ack/resolve bằng tay.
   */
  clear(itemKey: string): void {
    this.items.delete(itemKey);
  }

  /**
   * Snapshot top-N theo `failCount` giảm dần, cap `MAX_STALLED_ITEMS` — dùng để ghi vào
   * `finalizeAndRelease`.
   *
   * LUÔN gọi (kể cả khi rỗng): worker hồi phục hết ⇒ `[]` ⇒ ghi đè mảng cũ trên DB ⇒
   * tín hiệu tự tắt. Owner KHÔNG được truyền `undefined` khi rỗng (sẽ làm mảng cũ sống mãi).
   */
  snapshot(): WorkerStalledItem[] {
    return [...this.items.values()]
      .toSorted((a, b) => b.failCount - a.failCount)
      .slice(0, MAX_STALLED_ITEMS);
  }
}
