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
export function toUsername(playerExternalId: string, tenantId: string): string {
  return `${playerExternalId}@${tenantId}`.toLowerCase();
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
  username: string,
): { playerExternalId: string; tenantId: string } | null {
  const atIndex = username.indexOf("@");

  // Không có '@', hoặc '@' ở đầu / cuối → không hợp lệ.
  if (atIndex <= 0 || atIndex === username.length - 1) {
    return null;
  }

  return {
    playerExternalId: username.slice(0, atIndex),
    tenantId: username.slice(atIndex + 1),
  };
}
