/**
 * Use case: Player Refresh Token.
 *
 * Dùng refresh token để lấy cặp access/id token mới từ Cognito.
 * Flow REFRESH_TOKEN_AUTH chỉ cần ClientId + RefreshToken,
 * không cần password hay admin privileges.
 *
 * Lưu ý: Cognito KHÔNG trả refreshToken mới trong flow này —
 * client giữ nguyên refreshToken cũ cho đến khi hết hạn.
 *
 * ── Environment variables bắt buộc ──
 * - COGNITO_PLAYER_POOL_CLIENT_ID : App Client ID cho player (Cognito)
 */

import { initiateRefreshToken } from "@megawin/app-core/aws/cognito";
import { UseCase } from "@megawin/app-core/use-cases";
import { AppException } from "@megawin/shared/errors";

import type { PlayerRefreshTokenInput, PlayerRefreshTokenOutput } from "./dto/player-refresh-token.dto";

export class PlayerRefreshTokenUseCase extends UseCase<PlayerRefreshTokenInput, PlayerRefreshTokenOutput> {
  protected async execute(input: PlayerRefreshTokenInput): Promise<PlayerRefreshTokenOutput> {
    if (!input.COGNITO_PLAYER_POOL_CLIENT_ID) {
      throw AppException.internal("COGNITO_PLAYER_POOL_CLIENT_ID chưa được cấu hình");
    }

    try {
      return await initiateRefreshToken({
        clientId: input.COGNITO_PLAYER_POOL_CLIENT_ID,
        refreshToken: input.refreshToken,
      });
    } catch (err) {
      const awsErr = err as { name?: string };
      if (awsErr.name === "NotAuthorizedException") {
        throw AppException.unauthorized("Refresh token không hợp lệ hoặc đã hết hạn");
      }
      throw AppException.internal("Refresh token thất bại", {
        cause: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
