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
  username: string;
  displayName: string;
  status: AccountStatus;
  tenantId: string;
  roles: PlayerRole[];
  createdAt: string;
  updatedAt: string;
}
