import type { AccountStatus, PlayerRole } from "@megawin/identity/entities";

/**
 * Input cho GetPlayerAccountUseCase.
 * Bắt buộc truyền accountId (ULID) — không dùng username để tránh nhầm format.
 */
export interface GetPlayerAccountInput {
  accountId: string;
}

/**
 * Output cho GetPlayerAccountUseCase.
 * Trả về đủ thông tin hiển thị trên trang Player Detail.
 */
export interface GetPlayerAccountOutput {
  accountId: string;
  username: string;
  displayName: string;
  status: AccountStatus;
  roles: PlayerRole[];
  tenantId: string;
  createdAt: string;
  updatedAt: string;
}
