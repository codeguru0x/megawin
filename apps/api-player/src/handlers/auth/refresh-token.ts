/**
 * Lambda handler: POST /me/refresh-token
 * Làm mới access token cho player bằng refresh token.
 * Endpoint này KHÔNG yêu cầu Cognito JWT auth — chỉ cần refreshToken hợp lệ.
 */

import { withPublicHandler } from "@megawin/auth";
import { PlayerRefreshTokenUseCase } from "@megawin/identity-application/use-cases/players";
import { z } from "zod";

const bodySchema = z.object({
  refreshToken: z.string().min(1, "refreshToken is required"),
});

const useCase = new PlayerRefreshTokenUseCase();

export const handler = withPublicHandler(
  async (event) => {
    const { refreshToken } = event.schema.body;
    return useCase.run({
      refreshToken,
      COGNITO_PLAYER_POOL_CLIENT_ID: process.env.COGNITO_PLAYER_POOL_CLIENT_ID!,
    });
  },
  { schemas: { body: bodySchema } },
);
