/**
 * Lambda handler: POST /me/refresh-token
 * Làm mới access token cho player bằng refresh token.
 * Endpoint này KHÔNG yêu cầu Cognito JWT auth — chỉ cần refreshToken hợp lệ.
 */

import middy from "@middy/core";
import { z } from "zod";
import {
  validatorZodMiddleware,
  httpErrorHandlerUseCaseFormat,
} from "@megawin/app-core/lambda/middleware";

import { PlayerRefreshTokenUseCase } from "@megawin/identity-application/use-cases/players";

const bodySchema = z.object({
  refreshToken: z.string().min(1, "refreshToken is required"),
});

const useCase = new PlayerRefreshTokenUseCase();

export const handler = middy(async (event: { schema: { body: z.infer<typeof bodySchema> } }) => {
  const { refreshToken } = event.schema.body;
  return useCase.run({
    refreshToken,
    COGNITO_PLAYER_POOL_CLIENT_ID: process.env.COGNITO_PLAYER_POOL_CLIENT_ID!,
  });
})
  .use(validatorZodMiddleware({ body: bodySchema }))
  .use(httpErrorHandlerUseCaseFormat());
