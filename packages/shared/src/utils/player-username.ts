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
export function parseUsername(
  megawinUsername: string,
): { playerExternalId: string; tenantId: string } | null {
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
