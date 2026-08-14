import { UseCase } from "@megawin/app-core/use-cases";

import { AccountRepository } from "../../infras/repos/account-repo";
import type { SearchPlayerAccountsInput, SearchPlayerAccountsOutput } from "./dto/search-player-account.dto";

/**
 * Tìm kiếm tài khoản người chơi cross-tenant.
 *
 * Hỗ trợ 3 kiểu search:
 * - ULID → exact match accountId (0-1 kết quả)
 * - username@tenant → exact match username (0-1 kết quả)
 * - prefix text → prefix regex ^keyword trên username (0-N kết quả, limit 20)
 *
 * Dùng cho tính năng search nhanh trên Backoffice > Tài khoản người chơi.
 */
export class SearchPlayerAccountsUseCase extends UseCase<SearchPlayerAccountsInput, SearchPlayerAccountsOutput> {
  private readonly repo = new AccountRepository();

  protected async execute(input: SearchPlayerAccountsInput): Promise<SearchPlayerAccountsOutput> {
    const players = await this.repo.searchPlayerAccounts(input.keyword);

    return {
      accounts: players.map((player) => ({
        accountId: player.accountId,
        username: player.username,
        displayName: player.displayName,
        status: player.status,
        roles: player.roles,
        tenantId: player.tenantId,
        createdAt: player.createdAt.toISOString?.() ?? String(player.createdAt),
        updatedAt: player.updatedAt.toISOString?.() ?? String(player.updatedAt),
      })),
    };
  }
}
