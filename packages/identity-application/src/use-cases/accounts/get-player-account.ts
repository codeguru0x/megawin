import { UseCase } from "@megawin/app-core/use-cases";
import { AccountType } from "@megawin/identity/entities";
import { AppException } from "@megawin/shared/errors";

import { AccountRepository } from "../../infras/repos/account-repo";
import type { GetPlayerAccountInput, GetPlayerAccountOutput } from "./dto/get-player-account.dto";

/**
 * Lấy thông tin tài khoản người chơi theo accountId.
 *
 * Dùng cho trang Player Detail trên Backoffice.
 * Validate type = "player" trước khi trả về — tránh lấy nhầm Company/Agent account.
 * 1 DB query — findOne by accountId.
 */
export class GetPlayerAccountUseCase extends UseCase<GetPlayerAccountInput, GetPlayerAccountOutput> {
  private readonly repo = new AccountRepository();

  protected async execute(input: GetPlayerAccountInput): Promise<GetPlayerAccountOutput> {
    const account = await this.repo.findOne({ accountId: input.accountId });

    if (!account) {
      throw AppException.notFound("Không tìm thấy tài khoản người chơi.");
    }

    // Chỉ cho phép lấy player account — không expose Company/Agent qua endpoint này
    if (account.type !== AccountType.Player) {
      throw AppException.notFound("Không tìm thấy tài khoản người chơi.");
    }

    return {
      accountId: account.accountId,
      username: account.username,
      displayName: account.displayName,
      status: account.status,
      roles: account.roles as typeof account.roles & [],
      tenantId: (account as { tenantId: string }).tenantId,
      createdAt: account.createdAt.toISOString?.() ?? String(account.createdAt),
      updatedAt: account.updatedAt.toISOString?.() ?? String(account.updatedAt),
    };
  }
}
