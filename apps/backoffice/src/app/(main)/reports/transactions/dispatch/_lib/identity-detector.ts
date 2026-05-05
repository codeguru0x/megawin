/**
 * Detect loại identity từ string nhập tay — cho universal search input.
 *
 * Chiến lược: chỉ nhận dạng 3 type có format **cố định**:
 * - **tx** (UUIDv7) — 36 ký tự hex với dấu `-` chuẩn RFC 9562.
 * - **accountId** (ULID) — 26 ký tự Crockford Base32.
 * - **username** (`playerId@tenantId`) — chứa `@`.
 *
 * Các input khác fallback → **batchKey**. Lý do: batch key format mở
 * (`keno:settle:2026-04-11.007:payout`, `keno:resettle:{drawId}:{uuid}`, ...)
 * — tốt hơn là để server match exact thay vì gắng regex detect tay.
 */
export type IdentityKind = "tx" | "batchKey" | "accountId" | "username";

const UUID_V7_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const USERNAME_RE = /^[a-z0-9_]+@[a-z0-9_]+$/i;

/**
 * Detect identity kind từ input string.
 *
 * Ưu tiên match 3 type cố định (tx/accountId/username). Không match → coi là
 * **batchKey** (default fallback). Chỉ trả `null` khi input rỗng.
 *
 * @param input — Raw user input.
 * @returns `IdentityKind` hoặc `null` nếu input rỗng sau trim.
 */
export function detectIdentity(input: string): IdentityKind | null {
  const value = input.trim();
  if (!value) return null;
  if (UUID_V7_RE.test(value)) return "tx";
  if (USERNAME_RE.test(value)) return "username";
  if (ULID_RE.test(value)) return "accountId";
  return "batchKey";
}

/**
 * Nhãn tiếng Việt cho identity kind — hiển thị trên placeholder/hint.
 */
export const IDENTITY_KIND_LABELS: Record<IdentityKind, string> = {
  tx: "Tx ID",
  batchKey: "Batch Key",
  accountId: "Account ID",
  username: "Username",
};

/**
 * Hint gợi ý format cho staff khi mở tooltip.
 *
 * Tx/Account/Username có format cố định → nếu không match sẽ được hiểu là
 * Batch Key. Batch Key tự do vì đa dạng (settle/resettle/void + draw/uuid).
 */
export const IDENTITY_HINT = [
  "Tx ID: UUID (VD: 019bc10d-4395-7f8e-…)",
  "Account ID: ULID 26 ký tự (VD: 01HXYZABC123…)",
  "Username: playerId@tenantId (VD: tk01@one)",
  "Batch Key: mặc định — mọi giá trị khác, VD keno:settle:2026-04-11.007:payout",
].join("\n");
