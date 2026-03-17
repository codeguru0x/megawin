import { NextApiUseCase } from "@megawin/next/server";
import { AccountRepository } from "../../infras/repos/account-repo";
import type {
  ListPlayerAccountsInput,
  ListPlayerAccountsOutput,
  PlayerAccountItem,
} from "./dto/list-player-accounts.dto";

/** Số dòng mặc định mỗi trang — khớp với ACCOUNTS_PAGE_SIZE phía frontend. */
const DEFAULT_LIMIT = 50;

/**
 * Liệt kê tài khoản người chơi của một Tenant với phân trang.
 *
 * Dùng cho trang Backoffice > Tài khoản người chơi.
 * Bắt buộc truyền tenantId — KHÔNG list toàn bộ cross-tenant.
 * Hỗ trợ page/limit để phân trang phía server.
 */
export class ListPlayerAccountsUseCase extends NextApiUseCase<
  ListPlayerAccountsInput,
  ListPlayerAccountsOutput
> {
  protected async execute(input: ListPlayerAccountsInput): Promise<ListPlayerAccountsOutput> {
    const repo = new AccountRepository();

    const page = input.page ?? 1;
    const limit = input.limit ?? DEFAULT_LIMIT;
    const skip = (page - 1) * limit;

    const { accounts: players, total } = await repo.listPlayerAccounts(input.tenantId, {
      skip,
      limit,
    });

    const accounts: PlayerAccountItem[] = players.map((player) => ({
      username: player.username,
      displayName: player.displayName,
      status: player.status,
      tenantId: player.tenantId,
      roles: player.roles,
      createdAt: player.createdAt.toISOString?.() ?? String(player.createdAt),
      updatedAt: player.updatedAt.toISOString?.() ?? String(player.updatedAt),
    }));

    return { accounts, total, page, limit };
  }
}
