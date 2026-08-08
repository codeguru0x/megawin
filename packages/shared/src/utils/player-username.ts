/**
 * Chuyển đổi giữa player external ID (bên tenant) và Megawin username.
 *
 * Format Megawin username: `${playerExternalId}@${tenantId}` (lowercase).
 * Ví dụ: playerExternalId="User123", tenantId="ACME" → "user123@acme"
 */

/**
 * Tạo Megawin username từ playerExternalId và tenantId của tenant.
 *
 * @param playerExternalId - ID player phía tenant (case-insensitive).
 * @param tenantId - ID tenant sở hữu player.
 * @returns Megawin username dạng `${playerExternalId}@${tenantId}` (lowercase).
 */
export function toMegawinUsername(playerExternalId: string, tenantId: string): string {
  return `${playerExternalId}@${tenantId}`.toLowerCase();
}

/**
 * Chuyển đổi Megawin username thành tenant username. (loại bỏ suffix @tenantId)
 * @param megawinUsername - Megawin username cần chuyển đổi.
 * @returns Tenant username dạng `${playerExternalId}` (lowercase).
 */
export function toTenantUsername(megawinUsername: string): string {
  const parsed = parseUsername(megawinUsername);

  return parsed !== null ? parsed.playerExternalId : megawinUsername;
}

/**
 * Parse Megawin username thành `{ playerExternalId, tenantId }` của tenant.
 *
 * Trả về `null` nếu username không đúng định dạng `<id>@<tenantId>`
 * (thiếu `@`, hoặc phần trước / sau `@` rỗng).
 *
 * @param username - Megawin username cần parse.
 */
export function parseUsername(megawinUsername: string): { playerExternalId: string; tenantId: string } | null {
  const atIndex = megawinUsername.indexOf("@");

  // Không có '@', hoặc '@' ở đầu / cuối → không hợp lệ.
  if (atIndex <= 0 || atIndex === megawinUsername.length - 1) {
    return null;
  }

  return {
    playerExternalId: megawinUsername.slice(0, atIndex),
    tenantId: megawinUsername.slice(atIndex + 1),
  };
}

/**
 * Tách Megawin username thành phần hiển thị nhất quán trên **backoffice**.
 *
 * QUY TẮC HIỂN THỊ USERNAME (backoffice): tên tài khoản luôn hiện dạng
 * `<playerExternalId> · <tenantId>` — tên sạch (bỏ suffix `@tenantId`) + đại lý phía sau,
 * phân tách bằng dấu `·`. KHÔNG hiển thị raw `player4@devone` (dấu `@`) lẫn lộn với dạng
 * có `·` ở chỗ khác — trước đây alert/top show `@`, live-feed show `·` gây bất nhất.
 *
 * Component render `<primary> · <tenant>` (tenant có thể ẩn/mờ tuỳ chỗ). Dùng cho mọi
 * nơi hiển thị người chơi: alert, top risk, live-feed, combo lookup…
 *
 * @param megawinUsername - Username dạng `<id>@<tenantId>`, hoặc fallback (accountId).
 * @returns `{ primary, tenantId }` — `tenantId` là `null` khi input không có suffix `@`.
 */
export function splitBackofficeUsername(megawinUsername: string): {
  primary: string;
  tenantId: string | null;
} {
  const parsed = parseUsername(megawinUsername);
  if (parsed === null) return { primary: megawinUsername, tenantId: null };
  return { primary: parsed.playerExternalId, tenantId: parsed.tenantId };
}
