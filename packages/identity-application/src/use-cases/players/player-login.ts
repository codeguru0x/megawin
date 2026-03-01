/**
 * Use case: Player Login (Server-to-Server).
 *
 * Luồng:
 * 1. Validate tenant (active).
 * 2. Derive deterministic password từ PLAYER_PASSWORD_SECRET + username.
 * 3. Tạo Cognito user nếu chưa tồn tại (adminCreateAccount) với accountId ULID.
 * 4. Lưu player account vào MongoDB (findOrCreate).
 * 5. Lấy Cognito token (adminInitiateAuth) và trả về client.
 *
 * Auth: Tenant đã được xác thực bằng API Key + IP whitelist ở handler layer.
 */

import { createHmac } from "crypto";
import { ApiGatewayUseCase } from "@megawin/app-core/use-cases";
import { AppException } from "@megawin/shared/errors";
import { generateULID } from "@megawin/shared/utils/unique";
import {
  adminCreateAccount,
  adminInitiateAuth,
  adminSetUserPassword,
  adminUpdateUserAttributes,
  COGNITO_PLAYER_POOL_ID,
  COGNITO_PLAYER_POOL_CLIENT_ID,
} from "@megawin/app-core/aws/cognito";
import {
  AccountType,
  AccountStatus,
  PlayerRole,
} from "@megawin/identity/entities";
import { ClaimKey } from "@megawin/identity/entities/claim";
import { TenantStatus } from "@megawin/identity/entities/tenant";

import { AccountRepository } from "../../infras/repos/account-repo";
import { TenantRepository } from "../../infras/repos/tenant-repo";
import type {
  PlayerLoginInput,
  PlayerLoginOutput,
} from "./dto/player-login.dto";

const PLAYER_PASSWORD_SECRET = process.env.PLAYER_PASSWORD_SECRET;

/**
 * HMAC-SHA256 deterministic password.
 * Kết quả luôn giống nhau cho cùng username → chỉ cần adminInitiateAuth khi login lại,
 * không cần adminSetUserPassword mỗi lần.
 */
function derivePlayerPassword(cognitoUsername: string): string {
  return `Pw@68.${createHmac("sha256", PLAYER_PASSWORD_SECRET!).update(cognitoUsername).digest("base64url").slice(0, 28)}`;
}

export class PlayerLoginUseCase extends ApiGatewayUseCase<
  PlayerLoginInput,
  PlayerLoginOutput
> {
  protected async execute(input: PlayerLoginInput): Promise<PlayerLoginOutput> {
    const { playerExternalId, tenantId } = input;

    await this.loadAndValidateTenant(tenantId);

    const cognitoUsername = `${playerExternalId}@${tenantId}`.toLowerCase();
    const displayName = playerExternalId;

    this.assertConfig();

    const { account, isNewAccount } = await this.ensurePlayerAccount(
      cognitoUsername,
      displayName,
      tenantId
    );

    const password = derivePlayerPassword(cognitoUsername);
    const tokens = await this.getCognitoTokens(cognitoUsername, password);

    return {
      ...tokens,
      player: {
        accountId: account.accountId,
        username: cognitoUsername,
        displayName: account.displayName,
        tenantId,
        isNewAccount,
      },
    };
  }

  private async loadAndValidateTenant(tenantId: string) {
    const tenantRepo = new TenantRepository();
    const tenant = await tenantRepo.getTenantById(tenantId);

    if (!tenant) {
      throw AppException.notFound(`Tenant "${tenantId}" không tồn tại`);
    }

    if (tenant.status !== TenantStatus.Active) {
      throw AppException.forbidden(`Tenant "${tenantId}" đã bị vô hiệu hóa`);
    }

    return tenant;
  }

  private assertConfig() {
    if (!COGNITO_PLAYER_POOL_ID) {
      throw AppException.internal(
        "COGNITO_PLAYER_USERPOOL_ID chưa được cấu hình"
      );
    }
    if (!COGNITO_PLAYER_POOL_CLIENT_ID) {
      throw AppException.internal(
        "COGNITO_PLAYER_USERPOOL_CLIENT_ID chưa được cấu hình"
      );
    }
    if (!PLAYER_PASSWORD_SECRET) {
      throw AppException.internal("PLAYER_PASSWORD_SECRET chưa được cấu hình");
    }
  }

  /**
   * Đảm bảo player account tồn tại trong cả Cognito và MongoDB.
   * - New account: adminCreateAccount + adminSetUserPassword(permanent) + MongoDB upsert
   * - Existing account: chỉ cập nhật status nếu cần
   */
  private async ensurePlayerAccount(
    cognitoUsername: string,
    displayName: string,
    tenantId: string
  ) {
    const accountRepo = new AccountRepository();
    const accountId = generateULID();
    const password = derivePlayerPassword(cognitoUsername);
    let isNewAccount = false;
    let cognitoSub: string;

    try {
      const result = await adminCreateAccount({
        userPoolId: COGNITO_PLAYER_POOL_ID!,
        username: cognitoUsername,
        temporaryPassword: password,
        messageActionSuppress: true,
        requirePasswordResetOnFirstLogin: false,
        userAttributes: [
          { Name: ClaimKey.AccountId, Value: accountId },
          { Name: ClaimKey.AccountType, Value: AccountType.Player },
          { Name: ClaimKey.AccountStatus, Value: AccountStatus.Active },
          { Name: ClaimKey.Roles, Value: PlayerRole.Player },
          { Name: ClaimKey.TenantId, Value: tenantId },
        ],
      });

      cognitoSub =
        result.User?.Attributes?.find((a) => a.Name === ClaimKey.Sub)?.Value ??
        cognitoUsername;

      await adminSetUserPassword({
        userPoolId: COGNITO_PLAYER_POOL_ID!,
        username: cognitoUsername,
        password,
        permanent: true,
      });

      isNewAccount = true;
    } catch (err: unknown) {
      if (this.isUsernameExistsError(err)) {
        await adminUpdateUserAttributes({
          userPoolId: COGNITO_PLAYER_POOL_ID!,
          username: cognitoUsername,
          userAttributes: [
            { Name: ClaimKey.AccountStatus, Value: AccountStatus.Active },
          ],
        });

        cognitoSub = cognitoUsername;
        isNewAccount = false;
      } else {
        throw AppException.internal("Tạo tài khoản Cognito thất bại", {
          cause: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const account = await accountRepo.findOrCreatePlayerAccount(
      cognitoUsername,
      displayName,
      tenantId,
      accountId,
      COGNITO_PLAYER_POOL_ID!,
      cognitoSub!,
      cognitoUsername
    );

    if (!account) {
      throw AppException.internal("Lưu thông tin player vào database thất bại");
    }

    return { account, isNewAccount };
  }

  private async getCognitoTokens(cognitoUsername: string, password: string) {
    try {
      return await adminInitiateAuth({
        userPoolId: COGNITO_PLAYER_POOL_ID!,
        clientId: COGNITO_PLAYER_POOL_CLIENT_ID!,
        username: cognitoUsername,
        password,
      });
    } catch (err) {
      throw AppException.internal("Lấy token từ Cognito thất bại", {
        cause: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private isUsernameExistsError(err: unknown): boolean {
    const awsErr = err as { name?: string; __type?: string };
    return (
      awsErr.name === "UsernameExistsException" ||
      !!awsErr.__type?.includes("UsernameExistsException")
    );
  }
}
