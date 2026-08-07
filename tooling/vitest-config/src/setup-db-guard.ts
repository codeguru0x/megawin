/**
 * Vitest setup guard — CHẶN test integration chạy trên DB KHÔNG PHẢI test.
 *
 * NGUỒN CHÂN LÝ DUY NHẤT cho db-guard toàn monorepo (trước đây copy-paste per-package,
 * chỉ `game-power655-application` có — mọi package integration khác KHÔNG được bảo vệ).
 * Mọi package integration PHẢI trỏ `setupFiles` về `@megawin/vitest-config/setup-db-guard`
 * (qua preset `integrationConfig`) — KHÔNG copy file này ra package riêng.
 *
 * Lý do tồn tại (sự cố 05/08/2026): test integration dùng DB thật qua `MONGODB_URI`.
 * Một test từng gọi `deleteMany({})` không scope → XOÁ SẠCH tenant config thật khi URI
 * vô tình trỏ vào DB dùng chung (dev/shared). File này chạy ĐẦU MỖI test worker
 * (`setupFiles`), gồm 2 lớp phòng thủ:
 *
 * ## Lớp 1 — Fail-fast theo URI (điều kiện cho phép chạy)
 *
 * 0. KHÔNG có `MONGODB_URI` → test chạy chế độ mock/pure (không chạm DB thật) →
 *    BỎ QUA guard, cho chạy bình thường. Không connection = không rủi ro.
 * 1. URI trỏ **local** (`localhost` / `127.0.0.1`) — máy dev, an toàn mặc định.
 * 2. Set tường minh `ALLOW_DB_TESTS=true` — đồng thuận rõ ràng khi cố ý chạy trên DB
 *    test remote (staging chung — xem `.cursor/rules/test-data-safety.mdc`). Đặt cờ này =
 *    cam kết "URI này được phép chạm, tôi đã đọc và tuân quy tắc an toàn dữ liệu test".
 *
 * CÓ URI remote + KHÔNG cờ → throw, dừng test. Thà đỏ CI còn hơn xoá data thật.
 *
 * ## Lớp 2 — Chặn ĐỘNG lệnh xoá/sửa filter rỗng (MỚI)
 *
 * Dù Lớp 1 cho phép chạy (local hoặc `ALLOW_DB_TESTS=true`), URI vẫn có thể là DB **staging
 * dùng chung** — một lệnh `deleteMany({})` vẫn phá dữ liệu thật. Monkey-patch
 * `Collection.prototype`/`Db.prototype` của driver `mongodb` để THROW ngay khi phát hiện:
 * filter rỗng ở lệnh ghi/xoá, hoặc lệnh drop toàn collection/database. Hoạt động bất kể ai
 * gọi (test, seed helper, code use-case lỡ chạy trong test) — phòng khi filter được build
 * động thành `{}` mà Cursor rule (lớp tĩnh) không bắt được lúc review.
 */

type AnyFn = (...args: unknown[]) => unknown;

function isEmptyFilter(filter: unknown): boolean {
  if (filter === undefined || filter === null) {
    return true;
  }
  if (typeof filter !== "object") {
    return false;
  }
  return Object.keys(filter as Record<string, unknown>).length === 0;
}

function guardMessage(method: string): string {
  return (
    `[test-guard] "${method}" bị chặn — filter RỖNG hoặc lệnh xoá/sửa không-scope. ` +
    `DB test có thể dùng CHUNG với staging (xem .cursor/rules/test-data-safety.mdc) — filter ` +
    `rỗng có thể xoá/sửa TOÀN BỘ collection. Dùng filter SCOPED khớp đúng record do test tạo ra.`
  );
}

/**
 * Monkey-patch driver `mongodb` — chặn ĐỘNG mọi lệnh xoá/sửa filter rỗng + lệnh drop.
 * Import động `mongodb` (không import tĩnh ở đầu file) để preset `nodeConfig`/`jsdomConfig`
 * (không cần Mongo) không bị kéo dependency `mongodb` vào bundle.
 */
async function installDangerousOperationGuard(): Promise<void> {
  const mongodb = await import("mongodb");
  const CollectionProto = mongodb.Collection.prototype as unknown as Record<string, AnyFn>;
  const DbProto = mongodb.Db.prototype as unknown as Record<string, AnyFn>;

  // ── Nhóm 1: lệnh ghi/xoá nhận filter là tham số đầu tiên ────────────────────
  const filterGuardedMethods = [
    "deleteMany",
    "deleteOne",
    "updateMany",
    "updateOne",
    "findOneAndDelete",
    "findOneAndUpdate",
  ];

  for (const method of filterGuardedMethods) {
    const original = CollectionProto[method];
    if (typeof original !== "function") {
      continue;
    }
    CollectionProto[method] = function guarded(this: unknown, filter: unknown, ...rest: unknown[]) {
      if (isEmptyFilter(filter)) {
        throw new Error(guardMessage(method));
      }
      return original.apply(this, [filter, ...rest]);
    };
  }

  // ── Nhóm 2: lệnh xoá toàn collection/database — CẤM TUYỆT ĐỐI, không có case hợp lệ ──
  const unconditionallyBannedMethods: Array<[Record<string, AnyFn>, string]> = [
    [CollectionProto, "drop"],
    [DbProto, "dropDatabase"],
    [DbProto, "dropCollection"],
  ];

  for (const [proto, method] of unconditionallyBannedMethods) {
    const original = proto[method];
    if (typeof original !== "function") {
      continue;
    }
    proto[method] = function guarded() {
      throw new Error(
        `[test-guard] "${method}" bị CẤM TUYỆT ĐỐI trong test — xem .cursor/rules/test-data-safety.mdc.`,
      );
    };
  }
}

// ─── Lớp 1 ───────────────────────────────────────────────────────────────────
const uri = process.env.MONGODB_URI ?? "";

// KHÔNG có MONGODB_URI → test đang chạy chế độ mock/pure (không chạm DB thật).
// Không có connection = không có rủi ro xoá/ghi → bỏ qua guard, cho test chạy.
// (Test dùng DB thật mà quên set URI sẽ tự fail lúc connect, không phá dữ liệu.)
if (uri) {
  const isLocal = /(^|@|\/\/)(localhost|127\.0\.0\.1)([:/]|$)/.test(uri);
  const explicitlyAllowed = process.env.ALLOW_DB_TESTS === "true";

  if (!isLocal && !explicitlyAllowed) {
    // Che credential trong log (chỉ lộ host) — không in nguyên URI có password.
    const safeHost = uri.replace(/\/\/[^@]*@/, "//***@").split("?")[0];
    throw new Error(
      `[test-guard] MONGODB_URI KHÔNG phải local (${safeHost}). Test integration có lệnh ` +
        `xoá/ghi — từ chối chạy để tránh phá DB thật. Nếu đây THẬT SỰ là DB test, set ` +
        `ALLOW_DB_TESTS=true trong .env.test.local để xác nhận.`,
    );
  }

  // ─── Lớp 2 ─────────────────────────────────────────────────────────────────
  await installDangerousOperationGuard();
}
