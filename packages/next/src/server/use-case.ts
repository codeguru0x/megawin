/**
 * Use case cho Next.js API Route – trả NextResponse chuẩn ApiResponse format.
 *
 * @example
 * // With input:
 * class CreateUserUseCase extends NextApiUseCase<CreateUserDto, UserOutput> {
 *   protected async execute(input: CreateUserDto) {
 *     return { id: "1", name: "John" };
 *   }
 * }
 * const useCase = new CreateUserUseCase();
 * return useCase.run(dto, { successStatus: 201 });
 *
 * // Without input (I defaults to void):
 * class ListUsersUseCase extends NextApiUseCase<void, UserOutput[]> {
 *   protected async execute() {
 *     return [{ id: "1", name: "John" }];
 *   }
 * }
 * const listUseCase = new ListUsersUseCase();
 * return listUseCase.run(); // no input needed
 */

import { NextResponse } from "next/server";
import {
  type AppError,
  type AppResult,
  AppException,
  isAppError,
  APP_ERROR_CODES,
} from "@megawin/shared/errors";
import type {
  ApiErrorResponse,
  ApiResponseMeta,
  ApiSuccessResponse,
} from "../types";
import { apiSuccess, appErrorToApiResponse, apiError } from "./response";

// ============ Helpers ============

export function toNextResponse<O>(
  result: AppResult<O>,
  options?: {
    headers?: Record<string, string>;
    successStatus?: number;
    meta?: ApiResponseMeta;
  }
): NextResponse<ApiSuccessResponse<O> | ApiErrorResponse> {
  if (result.success) {
    return apiSuccess(result.data, {
      status: options?.successStatus ?? 200,
      headers: options?.headers,
      meta: options?.meta,
    });
  }
  return appErrorToApiResponse(result.error);
}

// ============ NextApiUseCase ============

export abstract class NextApiUseCase<I = void, O = void> {
  protected validate(_input: I): void | AppError {
    return undefined;
  }

  protected abstract execute(input: I): Promise<O>;

  async run(
    ...[input, options]: I extends void
      ? [options?: { successStatus?: number; meta?: ApiResponseMeta }]
      : [
          input: I,
          options?: { successStatus?: number; meta?: ApiResponseMeta },
        ]
  ): Promise<NextResponse<ApiSuccessResponse<O> | ApiErrorResponse>> {
    try {
      const validationError = this.validate(input as I);
      if (validationError) {
        return appErrorToApiResponse(validationError);
      }
      const output = await this.execute(input as I);
      return apiSuccess(output, {
        status: options?.successStatus ?? 200,
        meta: options?.meta,
      });
    } catch (err) {
      if (err instanceof AppException) {
        return appErrorToApiResponse(err.toError());
      }
      if (isAppError(err)) {
        return appErrorToApiResponse(err as AppError);
      }
      return apiError(500, {
        code: APP_ERROR_CODES.INTERNAL,
        message: err instanceof Error ? err.message : "Internal server error",
      });
    }
  }
}
