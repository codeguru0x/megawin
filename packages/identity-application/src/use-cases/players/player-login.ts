/**
 * Use case: Player Login (Server-to-Server).
 *
 * ── Tài khoản cũ (>99% requests) ──
 * 1. MongoDB exists(username)  → true
 * 2. Cognito adminInitiateAuth → trả token
 * → Tổng: 1 MongoDB + 1 Cognito = 2 calls (~55ms)
 *
 * ── Tài khoản mới ──
 * 1. MongoDB exists(username)    → false
 * 2. Cognito adminCreateAccount  → tạo user với custom attributes
 * 3. Cognito adminSetUserPassword → set permanent password (deterministic HMAC-SHA256)
 * 4. MongoDB findOrCreate        → lưu account vào collection
 * 5. Cognito adminInitiateAuth   → trả token
 * → Tổng: 2 MongoDB + 3 Cognito = 5 calls (~250ms, chỉ lần đầu)
 *
 * ── Edge case: Cognito có nhưng MongoDB chưa có ──
 * (Xảy ra khi lần trước tạo Cognito OK nhưng insert MongoDB fail)
 * 1. MongoDB exists → false
 * 2. Cognito adminCreateAccount → throw UsernameExistsException
 * 3. Cognito adminGetUser → lấy sub chính xác
 * 4. MongoDB findOrCreate → đồng bộ lại account
 * 5. Cognito adminInitiateAuth → trả token
 *
 * ── Environment variables bắt buộc ──
 * - COGNITO_PLAYER_POOL_ID     : User Pool ID cho player (Cognito)
 * - COGNITO_PLAYER_POOL_CLIENT_ID : App Client ID cho player (Cognito)
 * - PLAYER_PASSWORD_SECRET          : Secret key để derive deterministic password (HMAC-SHA256)
 *
 * Auth: Tenant đã được xác thực bằng API Key + IP whitelist ở handler layer.
 */

import { createHmac } from "crypto";
import { ApiGatewayUseCase } from "@megawin/app-core/use-cases";
import { AppException } from "@megawin/shared/errors";
import { generateULID } from "@megawin/shared/utils";
import {
  adminCreateAccount,
  adminGetUser,
  adminInitiateAuth,
  adminSetUserPassword,
  COGNITO_PLAYER_POOL_ID,
  COGNITO_PLAYER_POOL_CLIENT_ID,
} from "@megawin/app-core/aws/cognito";
import { AccountType, AccountStatus, PlayerRole } from "@megawin/identity/entities";
import { ClaimKey } from "@megawin/identity/entities";

import { AccountRepository } from "../../infras/repos/account-repo";
import type { PlayerLoginInput, PlayerLoginOutput } from "./dto/player-login.dto";
import { toMegawinUsername } from "@megawin/shared/utils";

const PLAYER_PASSWORD_SECRET = process.env.PLAYER_PASSWORD_SECRET;

function derivePlayerPassword(cognitoUsername: string): string {
  return `Pw@68.${createHmac("sha256", PLAYER_PASSWORD_SECRET!).update(cognitoUsername).digest("base64url").slice(0, 28)}`;
}

export class PlayerLoginUseCase extends ApiGatewayUseCase<PlayerLoginInput, PlayerLoginOutput> {
  private readonly accountRepo = new AccountRepository();

  protected async execute(input: PlayerLoginInput): Promise<PlayerLoginOutput> {
    const { playerExternalId, tenantId } = input;
    const cognitoUsername = toMegawinUsername(playerExternalId, tenantId);

    this.assertConfig();

    const accountExists = await this.accountRepo.usernameExists(cognitoUsername);

    if (!accountExists) {
      await this.createPlayerAccount(cognitoUsername, playerExternalId, tenantId);
    }

    return this.getCognitoTokens(cognitoUsername, derivePlayerPassword(cognitoUsername));
  }

  private assertConfig() {
    if (!COGNITO_PLAYER_POOL_ID) {
      throw AppException.internal("COGNITO_PLAYER_POOL_ID chưa được cấu hình");
    }
    if (!COGNITO_PLAYER_POOL_CLIENT_ID) {
      throw AppException.internal("COGNITO_PLAYER_POOL_CLIENT_ID chưa được cấu hình");
    }
    if (!PLAYER_PASSWORD_SECRET) {
      throw AppException.internal("PLAYER_PASSWORD_SECRET chưa được cấu hình");
    }
  }

  private async createPlayerAccount(
    cognitoUsername: string,
    displayName: string,
    tenantId: string,
  ) {
    const accountId = generateULID();
    const password = derivePlayerPassword(cognitoUsername);

    const cognitoSub = await this.ensureCognitoUser(cognitoUsername, password, accountId, tenantId);

    const account = await this.accountRepo.findOrCreatePlayerAccount(
      cognitoUsername,
      displayName,
      tenantId,
      accountId,
      AccountStatus.Active,
      COGNITO_PLAYER_POOL_ID!,
      cognitoSub,
      cognitoUsername,
    );

    if (!account) {
      throw AppException.internal("Lưu thông tin player vào database thất bại");
    }
  }

  private async ensureCognitoUser(
    cognitoUsername: string,
    password: string,
    accountId: string,
    tenantId: string,
  ): Promise<string> {
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

      const sub = result.User?.Attributes?.find((a) => a.Name === ClaimKey.Sub)?.Value;

      if (!sub) {
        throw AppException.internal("Cognito không trả về sub cho user vừa tạo");
      }

      await adminSetUserPassword({
        userPoolId: COGNITO_PLAYER_POOL_ID!,
        username: cognitoUsername,
        password,
        permanent: true,
      });

      return sub;
    } catch (err: unknown) {
      if (this.isUsernameExistsError(err)) {
        const user = await adminGetUser({
          userPoolId: COGNITO_PLAYER_POOL_ID!,
          username: cognitoUsername,
        });
        return user.sub;
      }
      throw AppException.internal("Tạo tài khoản Cognito thất bại", {
        cause: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async getCognitoTokens(
    cognitoUsername: string,
    password: string,
  ): Promise<PlayerLoginOutput> {
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
