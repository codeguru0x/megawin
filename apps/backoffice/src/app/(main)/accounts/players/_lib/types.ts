import type { PlayerAccount } from "./schema";

export interface ListPlayerAccountsResponse {
  accounts: PlayerAccount[];
  paginationToken?: string;
}
