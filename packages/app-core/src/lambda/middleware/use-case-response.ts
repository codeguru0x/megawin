/**
 * Helper: chạy ApiGateway use case và trả về response (handle error từ use case).
 * Dùng trong Lambda handler sau khi đã validate bằng validatorZodMiddleware.
 */

import type { UseCaseResult } from "#application/usecase/usecase-base";
import {
  toApiGatewayResponse,
  type ApiGatewayResponse,
} from "#lambda/http/usecase-api-gateway";

/**
 * Chạy use case với event (đã có event.validated nếu dùng validatorZodMiddleware),
 * rồi chuyển UseCaseResult thành ApiGatewayResponse.
 * Handler chỉ cần: return runUseCaseAndRespond(useCase, event);
 */
export async function runUseCaseAndRespond<O>(
  run: (event: unknown) => Promise<UseCaseResult<O>>,
  event: unknown,
  options?: { serialize?: (data: O) => string }
): Promise<ApiGatewayResponse> {
  const result = await run(event);
  return toApiGatewayResponse(result, options);
}
