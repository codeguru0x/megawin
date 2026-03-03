import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { type MfaStatus, MfaStatus as MfaStatusEnum } from "@megawin/identity/entities/account";
import { AccountRepository } from "../../infras/repos/account-repo";

export interface GetMyProfileInput {
  username: string;
}

export interface GetMyProfileOutput {
  accountId: string;
  username: string;
  displayName: string;
  accountType: string;
  roles: string[];
  status: string;
  mfaStatus: MfaStatus;
  createdAt: string;
}

export class GetMyProfileUseCase extends NextApiUseCase<
  GetMyProfileInput,
  GetMyProfileOutput
> {
  protected async execute(
    input: GetMyProfileInput
  ): Promise<GetMyProfileOutput> {
    const repo = new AccountRepository();
    const accounts = await repo.findMany({ username: input.username });
    const account = accounts[0];

    if (!account) {
      throw AppException.notFound("Không tìm thấy thông tin tài khoản");
    }

    return {
      accountId: account.accountId,
      username: account.username,
      displayName: account.displayName,
      accountType: account.type,
      roles: account.roles,
      status: account.status,
      mfaStatus: account.mfaStatus ?? MfaStatusEnum.None,
      createdAt: account.createdAt.toISOString?.() ?? String(account.createdAt),
    };
  }
}
