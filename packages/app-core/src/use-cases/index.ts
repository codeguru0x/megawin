/**
 * Use cases – chỉ chứa business logic.
 *
 * Error system (AppError, AppException, APP_ERROR_CODES) sống ở @megawin/shared/errors.
 * Re-export ở đây cho tiện.
 */

/** Error system (từ @megawin/shared/errors) */
export {
  APP_ERROR_CODES,
  type AppError,
  type AppErrorCode,
  AppException,
  type AppExceptionOptions,
  type AppResult,
  appErrorToStatusCode,
  errorCodeToStatusCode,
  type HttpErrorBody,
  type HttpErrorResponse,
  isAppError,
  toHttpErrorResponse,
} from "@megawin/shared/errors";

/**
 * API Gateway — type + converter tường minh (escape hatch cho response khác chuẩn).
 * Base class `ApiGatewayUseCase` đã XOÁ ở Phase 4 — dùng `UseCase`, envelope do middleware bọc.
 */
export { type ApiGatewayResponse, toApiGatewayResponse } from "./api-gateway";
/** Kinesis */
export { KinesisUseCase } from "./kinesis";
/** SNS */
export { SnsUseCase } from "./sns";
/** SQS */
export { SqsUseCase } from "./sqs";
/** UseCase – canonical base class: run() raw output + safeRun() AppResult, KHÔNG có validate() */
export { UseCase } from "./use-case";
