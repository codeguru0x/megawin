/**
 * JSON codec giữ nguyên `Date` khi đi qua L2 Redis.
 *
 * VÌ SAO CẦN (bug thật, 17/08): `CacheStore.get<T>()` hứa trả về `T`, nhưng L2 Redis lưu bằng
 * `JSON.stringify` nên `Date` biến thành ISO string. Consumer đọc theo type đã khai (`updatedAt: Date`)
 * rồi gọi `.toISOString()` → `TypeError: ... is not a function`. Lỗi CHỈ xuất hiện sau lần fetch đầu
 * (L1 memory giữ reference gốc, TTL 5s) nên rất dễ bị hiểu nhầm là lỗi tham số/DB.
 *
 * Ca đã bắt được: tool AI `getGameConfig` đọc `GlobalConfigEntity` từ cache → chết 100% mọi lần gọi
 * sau 5 giây đầu, và bị `ToolOutputSerializationError` của eve che mất lỗi thật.
 *
 * CƠ CHẾ: encode `Date` thành marker tường minh `{ "$date": "<ISO>" }` trước khi stringify, decode lại
 * thành `Date` sau khi parse. KHÔNG dùng heuristic "string nào trông giống ISO thì đổi thành Date" —
 * heuristic đó sẽ âm thầm đổi kiểu những string vốn LÀ string (`drawId`, `firstDrawTime`, cột text do
 * người nhập), tạo bug ngược hướng và khó tìm hơn bug đang sửa.
 *
 * PHẠM VI: chỉ dùng ở `RedisCacheStore` (biên JSON của cache). `MemoryCacheStore` lưu thẳng reference
 * nên `Date` vốn đã nguyên vẹn. `RedisRepository.setJson/getJson` giữ nguyên semantics JSON thuần —
 * codec KHÔNG chạm tới, nên mọi consumer đọc/ghi Redis ngoài `CacheStore` không bị ảnh hưởng.
 *
 * ⚠️ ĐỌC TRƯỚC KHI DEPLOY — codec đổi ĐỊNH DẠNG ON-WIRE, và cùng một cache key được nhiều app
 * ghi/đọc (read-through: `api-player`, `worker-*`, `backoffice` đều là WRITER khi cache miss).
 * Trong cửa sổ deploy lệch (app này đã lên, app kia chưa), cả hai chiều đều xảy ra:
 *
 * - **Reader mới ↔ entry cũ** (ISO string trần): decode giữ nguyên string. Codec KHÔNG tự chữa
 *   được ca này ⇒ consumer gọi method của `Date` vẫn chết y như bug gốc cho tới khi MỌI app đã
 *   deploy. Vì vậy consumer ở đường tiền/đường AI phải tự phòng thủ (`new Date(x)`), đừng coi
 *   codec là bảo đảm tuyệt đối.
 * - **Reader cũ ↔ entry mới**: app chưa deploy đọc ra `{ "$date": … }` thay vì string. Đã soi
 *   toàn bộ consumer hiện tại (17/08): các field `Date` được cache (`createdAt`/`updatedAt` của
 *   game config + tenant config, `startedAt`/`closedAt`/`createdAt`/`updatedAt` của jackpot cycle)
 *   KHÔNG tham gia tính toán nghiệp vụ nào và không có Zod nào validate chúng (repo không có
 *   `z.date()`) — tác hại tối đa là một nhãn "Cập nhật lúc" hiển thị sai trên backoffice, tự hết
 *   sau TTL (≤10 phút).
 *
 * ⛔ ĐỪNG "xử lý" cửa sổ trộn định dạng bằng cách bump `v{n}` trong `caches/keys.ts`. Nghe hợp lý
 * (tách keyspace ⇒ hai định dạng không gặp nhau) nhưng ĐỔI MỘT LỖI HIỂN THỊ THÀNH MỘT LỖI TIỀN:
 * invalidate là cross-app QUA KEY DÙNG CHUNG — `UpdateGameConfigUseCase` gọi `invalidate()` xoá
 * đúng key mà `api-player` đang đọc. Bump version giữa lúc deploy lệch ⇒ backoffice (v2) xoá v2,
 * còn `api-player` (chưa deploy, v1) tiếp tục phục vụ prize/caps CŨ tới hết TTL 10 phút. Sai tiền
 * 10 phút tệ hơn sai nhãn 10 phút. Chỉ bump khi shape dữ liệu thật sự đổi và chấp nhận được
 * staleness đó (hoặc deploy đồng thời mọi app).
 */

/** Khoá marker của một `Date` đã encode. Chọn `$`-prefix vì field Mongo/entity không dùng ký tự này. */
const DATE_MARKER_KEY = "$date";

/** Marker mà {@link encodeCacheValue} sinh ra cho mỗi `Date`. */
interface DateMarker {
  [DATE_MARKER_KEY]: string;
}

function isPlainObject(value: object): boolean {
  const proto = Object.getPrototypeOf(value);
  return proto === null || proto === Object.prototype;
}

/**
 * Gán field vào object đang dựng, an toàn cả với khoá `__proto__`.
 *
 * VÌ SAO KHÔNG DÙNG `out[key] = value` TRỰC TIẾP: với `key === "__proto__"`, phép gán đó KHÔNG tạo
 * own property mà đổi prototype của `out` — field biến mất khỏi kết quả và object mang prototype lạ
 * (đã kiểm chứng bằng thực nghiệm, không phải suy đoán). `JSON.parse` thì tạo own property bình
 * thường, nên nếu để nguyên, codec sẽ LÀM MẤT dữ liệu ở đúng ca mà JSON round-trip cũ giữ được.
 *
 * Chưa với tới được bằng dữ liệu hiện tại (field entity đều là tên cố định do dev khai), nhưng codec
 * nằm ở biên DÙNG CHUNG của toàn hệ thống: chỉ cần một cache tương lai lưu `Record<string, …>` với
 * khoá lấy từ input người dùng là lỗ này thành đường ghi đè prototype. Giá của việc chặn là 1 nhánh
 * `if` trên hot path — quá rẻ so với việc phải đi tìm lại nó sau.
 */
function setOwn(out: Record<string, unknown>, key: string, value: unknown): void {
  if (key === "__proto__") {
    Object.defineProperty(out, key, { configurable: true, enumerable: true, value, writable: true });
    return;
  }
  out[key] = value;
}

/**
 * Nhận diện marker do chính ta ghi: object CHỈ có đúng 1 khoá `$date` và giá trị là string.
 *
 * Kiểm cả `length === 1` để một entity thật có field tên `$date` kèm field khác không bị hiểu nhầm
 * thành Date — thà giữ nguyên object hơn là đổi kiểu sai.
 */
function isDateMarker(value: object): value is DateMarker {
  const keys = Object.keys(value);
  if (keys.length !== 1 || keys[0] !== DATE_MARKER_KEY) {
    return false;
  }
  return typeof (value as Record<string, unknown>)[DATE_MARKER_KEY] === "string";
}

/**
 * Đổi mọi `Date` trong `value` thành marker `{ "$date": ISO }` để `JSON.stringify` không làm mất kiểu.
 *
 * Giữ nguyên mọi thứ khác (kể cả class instance lạ) — codec này KHÔNG phải bộ sanitize JSON, nó chỉ
 * lo đúng một việc là `Date`.
 *
 * KHÔNG BAO GIỜ THROW. Ràng buộc bắt buộc, không phải phòng xa: `RedisCacheStore.set` bọc try/catch
 * fail-open, nên một exception ở đây không nổ ra ngoài mà biến thành "cache không bao giờ ghi được" —
 * mọi request sau đó đi thẳng DB, chỉ để lại một dòng `logWarn` lẫn giữa log lỗi Redis thật. Đó là
 * dạng hỏng tệ nhất: mất toàn bộ tác dụng cache mà không ai thấy.
 */
export function encodeCacheValue(value: unknown): unknown {
  if (value instanceof Date) {
    // `Invalid Date` (`new Date("rác")`) làm `toISOString()` throw `RangeError`. Trả `null` để khớp
    // ĐÚNG hành vi `JSON.stringify(new Date(NaN))` trước khi có codec — không đổi ngữ nghĩa của dữ
    // liệu vốn đã hỏng, chỉ đảm bảo không kéo theo mất cache.
    return Number.isNaN(value.getTime()) ? null : ({ [DATE_MARKER_KEY]: value.toISOString() } satisfies DateMarker);
  }
  if (Array.isArray(value)) {
    return value.map(encodeCacheValue);
  }
  if (typeof value === "object" && value !== null && isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      setOwn(out, key, encodeCacheValue(item));
    }
    return out;
  }
  return value;
}

/**
 * Đổi marker `{ "$date": ISO }` trở lại `Date` sau `JSON.parse`.
 *
 * ISO string trần (entry do bản cũ ghi) được giữ nguyên là string — xem ghi chú tương thích ngược ở
 * đầu file. Cũng KHÔNG BAO GIỜ THROW: `RedisCacheStore.get` fail-open, exception ở đây sẽ thành
 * cache-miss vĩnh viễn cho key đó.
 */
export function decodeCacheValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(decodeCacheValue);
  }
  if (typeof value === "object" && value !== null && isPlainObject(value)) {
    if (isDateMarker(value)) {
      // `new Date("rác")` KHÔNG throw, chỉ ra `Invalid Date` — và marker chỉ do `encodeCacheValue`
      // sinh ra nên luôn là ISO hợp lệ. Không cần validate thêm.
      return new Date(value[DATE_MARKER_KEY]);
    }
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      setOwn(out, key, decodeCacheValue(item));
    }
    return out;
  }
  return value;
}
