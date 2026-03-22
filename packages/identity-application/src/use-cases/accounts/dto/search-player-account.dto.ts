import type { AccountStatus, PlayerRole } from "@megawin/identity/entities/account";

/**
 * Input cho SearchPlayerAccountUseCase.
 *
 * keyword có thể là:
 * - ULID (accountId) — 26 ký tự Crockford Base32 → exact match
 * - username đầy đủ (chứa @) — dạng `user@tenantId` → exact match
 * - Prefix text (không chứa @) — dạng `player` → prefix search `^player*`
 */
export interface SearchPlayerAccountsInput {
  keyword: string;
}

/**
 * Output cho SearchPlayerAccountUseCase.
 *
 * Trả về mảng accounts (0-N kết quả):
 * - ULID / username exact: 0 hoặc 1
 * - Prefix search: 0 đến limit (mặc định 20)
 */
export interface SearchPlayerAccountsOutput {
  accounts: SearchPlayerAccountItem[];
}

export interface SearchPlayerAccountItem {
  accountId: string;
  username: string;
  displayName: string;
  status: AccountStatus;
  roles: PlayerRole[];
  tenantId: string;
  createdAt: string;
  updatedAt: string;
}
