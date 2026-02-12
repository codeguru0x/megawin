/**
 * Use case cho Next.js API Route.
 *
 * Tương tự ApiGatewayUseCase nhưng trả NextResponse thay vì API Gateway format.
 * NextApiUseCase.run(dto) trả thẳng NextResponse.
 *
 * @example
 * class CreateUserUseCase extends NextApiUseCase<CreateUserDto, UserOutput> {
 *   protected async execute(input: CreateUserDto) {
 *     throw AppException.conflict("Username taken");
 *   }
 * }
 *
 * // Route handler:
 * const useCase = new CreateUserUseCase();
 * return useCase.run(dto);
 */

import { NextResponse } from "next/server";
import {
  type AppError,
  type AppResult,
  AppException,
  isAppError,
  APP_ERROR_CODES,
  appErrorToStatusCode,
  toHttpErrorResponse,
} from "@megawin/shared/errors";

// ============ Helpers ============

/** Chuyển AppResult<O> thành NextResponse. */
export function toNextResponse<O>(
  result: AppResult<O>,
  options?: {
    headers?: Record<string, string>;
    successStatus?: number;
  },
): NextResponse {
  const headers = options?.headers;

  if (result.success) {
    return NextResponse.json(result.data, {
      status: options?.successStatus ?? 200,
      headers,
    });
  }

  const { statusCode, body } = toHttpErrorResponse(result.error);
  return NextResponse.json(body, { status: statusCode, headers });
}

// ============ NextApiUseCase ============

export abstract class NextApiUseCase<I, O> {
  protected validate(_input: I): void | AppError {
    return undefined;
  }

  protected abstract execute(input: I): Promise<O>;

  async run(input: I, options?: { successStatus?: number }): Promise<NextResponse> {
    try {
      const validationError = this.validate(input);
      if (validationError) {
        return toNextResponse<O>({ success: false, error: validationError });
      }
      const output = await this.execute(input);
      return toNextResponse<O>({ success: true, data: output }, options);
    } catch (err) {
      if (err instanceof AppException) {
        return toNextResponse<O>({ success: false, error: err.toError() });
      }
      if (isAppError(err)) {
        return toNextResponse<O>({ success: false, error: err as AppError });
      }
      return toNextResponse<O>({
        success: false,
        error: {
          code: APP_ERROR_CODES.INTERNAL,
          message: err instanceof Error ? err.message : "Unknown error",
        },
      });
    }
  }
}
