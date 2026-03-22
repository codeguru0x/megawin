import type { PlayerAccount } from "./schema";

/** Response cũ (skip/limit) — giữ để không break nếu còn dùng ở nơi khác. */
export interface ListPlayerAccountsResponse {
  accounts: PlayerAccount[];
  total: number;
  page: number;
  limit: number;
}

/** Response cursor-based pagination. */
export interface ListPlayerAccountsCursorResponse {
  accounts: PlayerAccount[];
  /**
   * accountId của record cuối trang — truyền vào ?after= để lấy trang tiếp.
   * null khi không còn trang tiếp.
   */
  nextCursor: string | null;
  /**
   * accountId của record đầu trang — truyền vào ?before= để lấy trang trước.
   * null khi đang ở trang đầu.
   */
  prevCursor: string | null;
  hasNext: boolean;
  hasPrev: boolean;
}

/** Response cho search cross-tenant — trả về mảng 0-N kết quả. */
export interface SearchPlayerAccountsResponse {
  accounts: PlayerAccount[];
}
