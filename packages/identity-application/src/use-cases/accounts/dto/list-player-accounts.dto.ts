import type { AccountStatus, PlayerRole } from "@megawin/identity/entities/account";

export interface ListPlayerAccountsInput {
  /** Lọc theo tenantId — bắt buộc. */
  tenantId: string;
  /** Số trang (1-based). Mặc định = 1. */
  page?: number;
  /** Số dòng mỗi trang. Mặc định = 50. */
  limit?: number;
}

export interface ListPlayerAccountsOutput {
  accounts: PlayerAccountItem[];
  /** Tổng số player trong tenant — dùng để hiển thị total và tính hasMore. */
  total: number;
  /** Trang hiện tại (1-based). */
  page: number;
  /** Số dòng mỗi trang. */
  limit: number;
}

export interface PlayerAccountItem {
  /** ID tài khoản player (ULID) — dùng để navigate tới player detail page. */
  accountId: string;
  username: string;
  displayName: string;
  status: AccountStatus;
  tenantId: string;
  roles: PlayerRole[];
  createdAt: string;
  updatedAt: string;
}

// ─── Cursor-based pagination ───────────────────────────────────────────────

export interface ListPlayerAccountsCursorInput {
  /** Lọc theo tenantId — bắt buộc. */
  tenantId: string;
  /**
   * entity.id (MongoDB ObjectId hex, 24 chars) của record cuối trang hiện tại → lấy trang tiếp.
   * Mutually exclusive với beforeId.
   */
  afterId?: string;
  /**
   * entity.id (MongoDB ObjectId hex, 24 chars) của record đầu trang hiện tại → lấy trang trước.
   * Mutually exclusive với afterId.
   */
  beforeId?: string;
  /** Số dòng mỗi trang. Mặc định = 50. */
  limit?: number;
}

export interface ListPlayerAccountsCursorOutput {
  accounts: PlayerAccountItem[];
  /**
   * entity.id (ObjectId hex) của record cuối trang — truyền vào afterId để lấy trang tiếp.
   * null khi không còn trang tiếp.
   */
  nextCursor: string | null;
  /**
   * entity.id (ObjectId hex) của record đầu trang — truyền vào beforeId để lấy trang trước.
   * null khi đang ở trang đầu.
   */
  prevCursor: string | null;
  hasNext: boolean;
  hasPrev: boolean;
}
