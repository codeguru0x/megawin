import { NextApiUseCase } from "@megawin/next/server";
import { AccountRepository } from "../../infras/repos/account-repo";
import type {
  ListPlayerAccountsInput,
  ListPlayerAccountsOutput,
  ListPlayerAccountsCursorInput,
  ListPlayerAccountsCursorOutput,
  PlayerAccountItem,
} from "./dto/list-player-accounts.dto";

/** Số dòng mặc định mỗi trang — khớp với ACCOUNTS_PAGE_SIZE phía frontend. */
const DEFAULT_LIMIT = 50;

/**
 * Liệt kê tài khoản người chơi của một Tenant với phân trang skip/limit (legacy).
 *
 * Dùng cho trang Backoffice > Tài khoản người chơi.
 * Bắt buộc truyền tenantId — KHÔNG list toàn bộ cross-tenant.
 * Hỗ trợ page/limit để phân trang phía server.
 */
export class ListPlayerAccountsUseCase extends NextApiUseCase<ListPlayerAccountsInput, ListPlayerAccountsOutput> {
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
      accountId: player.accountId,
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

/**
 * Liệt kê tài khoản người chơi của một Tenant với cursor-based pagination.
 *
 * Dùng `entity.id` (MongoDB ObjectId hex) làm cursor thay vì accountId (ULID).
 * `_id` là primary key — index luôn có sẵn, không cần tạo thêm.
 * Sort theo `_id DESC` (ObjectId monotonically increasing → mới nhất trước).
 *
 * nextCursor / prevCursor là `entity.id` (hex string) — frontend dùng làm ?after= / ?before=.
 */
export class ListPlayerAccountsCursorUseCase extends NextApiUseCase<
  ListPlayerAccountsCursorInput,
  ListPlayerAccountsCursorOutput
> {
  private readonly repo = new AccountRepository();

  protected async execute(input: ListPlayerAccountsCursorInput): Promise<ListPlayerAccountsCursorOutput> {
    const limit = input.limit ?? DEFAULT_LIMIT;

    const {
      accounts: players,
      hasNext,
      hasPrev,
    } = await this.repo.listPlayerAccountsCursor(input.tenantId, {
      afterId: input.afterId,
      beforeId: input.beforeId,
      limit,
    });

    const accounts: PlayerAccountItem[] = players.map((player) => ({
      accountId: player.accountId,
      username: player.username,
      displayName: player.displayName,
      status: player.status,
      tenantId: player.tenantId,
      roles: player.roles,
      createdAt: player.createdAt.toISOString?.() ?? String(player.createdAt),
      updatedAt: player.updatedAt.toISOString?.() ?? String(player.updatedAt),
    }));

    // cursor dùng entity.id (ObjectId hex) — primary key, luôn unique và có index
    const firstPlayer = players[0];
    const lastPlayer = players[players.length - 1];

    return {
      accounts,
      nextCursor: hasNext && lastPlayer ? lastPlayer.id : null,
      prevCursor: hasPrev && firstPlayer ? firstPlayer.id : null,
      hasNext,
      hasPrev,
    };
  }
}
