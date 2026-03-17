import type { PlayerAccount } from "./schema";

export interface ListPlayerAccountsResponse {
  accounts: PlayerAccount[];
  /** Tổng số player trong tenant. */
  total: number;
  /** Trang hiện tại (1-based). */
  page: number;
  /** Số dòng mỗi trang. */
  limit: number;
}
