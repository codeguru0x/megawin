/**
 * Use case: Player Login via Tenant JWKS Assertion.
 *
 * Luồng:
 * 1. Lấy tenant config (JWKS URL, issuer) từ MongoDB.
 * 2. Verify assertion token bằng JWKS public key của tenant.
 * 3. Tạo Cognito user nếu chưa tồn tại (adminCreateAccount).
 * 4. Lưu player account vào MongoDB (findOrCreate).
 * 5. Lấy Cognito token (adminInitiateAuth) và trả về client.
 */

import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { ApiGatewayUseCase } from "@megawin/app-core/use-cases";
import { AppException } from "@megawin/shared/errors";
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

interface VerifiedAssertionClaims extends JWTPayload {
  sub: string;
}

const PLAYER_TEMP_PASSWORD_LENGTH = 32;

function generateSecurePassword(length: number): string {
  const charset =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => charset[byte % charset.length]).join("");
}

/**
 * Cache JWKS key sets theo URL — jose's createRemoteJWKSet đã có built-in cache/refresh.
 */
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJWKS(jwksUrl: string) {
  let jwks = jwksCache.get(jwksUrl);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(jwksUrl));
    jwksCache.set(jwksUrl, jwks);
  }
  return jwks;
}

export class PlayerLoginUseCase extends ApiGatewayUseCase<
  PlayerLoginInput,
  PlayerLoginOutput
> {
  protected async execute(
    input: PlayerLoginInput
  ): Promise<PlayerLoginOutput> {
    const { assertionToken, tenantId } = input;

    const tenant = await this.loadAndValidateTenant(tenantId);

    const claims = await this.verifyAssertionToken(
      assertionToken,
      tenant.sso
    );

    const playerSubject = claims.sub;
    const cognitoUsername = `${tenantId}:${playerSubject}`;
    const displayName = playerSubject;

    this.assertCognitoConfig();

    const { account, isNewAccount, sessionPassword } =
      await this.ensurePlayerAccount(cognitoUsername, displayName, tenantId);

    const tokens = await this.getCognitoTokens(cognitoUsername, sessionPassword);

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
    if (!tenant.sso?.jwksUrl) {
      throw AppException.badRequest(
        `Tenant "${tenantId}" chưa cấu hình JWKS URL`
      );
    }

    return tenant;
  }

  private async verifyAssertionToken(
    token: string,
    ssoConfig: {
      jwksUrl: string;
      issuer: string;
      clockSkewSec?: number;
      maxTtlSec?: number;
    }
  ): Promise<VerifiedAssertionClaims> {
    const jwks = getJWKS(ssoConfig.jwksUrl);

    try {
      const { payload } = await jwtVerify(token, jwks, {
        issuer: ssoConfig.issuer,
        clockTolerance: ssoConfig.clockSkewSec ?? 5,
        maxTokenAge: `${ssoConfig.maxTtlSec ?? 120}s`,
      });

      if (!payload.sub) {
        throw AppException.badRequest(
          "Assertion token thiếu claim 'sub' (player identifier)"
        );
      }

      return payload as VerifiedAssertionClaims;
    } catch (err) {
      if (err instanceof AppException) throw err;

      const message =
        err instanceof Error ? err.message : "Token verification failed";
      throw AppException.unauthorized(`Token không hợp lệ: ${message}`);
    }
  }

  private assertCognitoConfig() {
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
  }

  /**
   * Đảm bảo player account tồn tại trong cả Cognito và MongoDB.
   * Trả về session password để authenticate ngay sau đó.
   */
  private async ensurePlayerAccount(
    cognitoUsername: string,
    displayName: string,
    tenantId: string
  ) {
    const accountRepo = new AccountRepository();
    const sessionPassword = generateSecurePassword(PLAYER_TEMP_PASSWORD_LENGTH);
    let isNewAccount = false;
    let cognitoSub: string;

    try {
      const result = await adminCreateAccount({
        userPoolId: COGNITO_PLAYER_POOL_ID!,
        username: cognitoUsername,
        temporaryPassword: sessionPassword,
        messageActionSuppress: true,
        requirePasswordResetOnFirstLogin: false,
        userAttributes: [
          { Name: ClaimKey.AccountType, Value: AccountType.Player },
          { Name: ClaimKey.AccountStatus, Value: AccountStatus.Active },
          { Name: ClaimKey.Roles, Value: PlayerRole.Player },
          { Name: ClaimKey.TenantId, Value: tenantId },
        ],
      });

      cognitoSub =
        result.User?.Attributes?.find((a) => a.Name === "sub")?.Value ??
        cognitoUsername;

      // Set permanent password để thoát FORCE_CHANGE_PASSWORD
      await adminSetUserPassword({
        userPoolId: COGNITO_PLAYER_POOL_ID!,
        username: cognitoUsername,
        password: sessionPassword,
        permanent: true,
      });

      isNewAccount = true;
    } catch (err: unknown) {
      if (this.isUsernameExistsError(err)) {
        // Player đã tồn tại — rotate password và cập nhật status
        await adminSetUserPassword({
          userPoolId: COGNITO_PLAYER_POOL_ID!,
          username: cognitoUsername,
          password: sessionPassword,
          permanent: true,
        });

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
      COGNITO_PLAYER_POOL_ID!,
      cognitoSub!,
      cognitoUsername
    );

    if (!account) {
      throw AppException.internal(
        "Lưu thông tin player vào database thất bại"
      );
    }

    return { account, isNewAccount, sessionPassword };
  }

  private async getCognitoTokens(
    cognitoUsername: string,
    password: string
  ) {
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
