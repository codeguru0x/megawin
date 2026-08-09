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

/** API Gateway */
export {
  type ApiGatewayResponse,
  ApiGatewayUseCase,
  toApiGatewayResponse,
  useCaseErrorToStatusCode,
} from "./api-gateway";
/** Legacy aliases */
export {
  BaseUseCase,
  isUseCaseError,
  USE_CASE_ERROR_CODES,
  type UseCaseError,
  type UseCaseErrorCode,
  UseCaseException,
  type UseCaseResult,
} from "./base";
/** Internal Use Case – trả raw output, throw AppException */
export { InternalUseCase } from "./internal-use-case";
/** Kinesis */
export { KinesisUseCase } from "./kinesis";
/** SNS */
export { SnsUseCase } from "./sns";
/** SQS */
export { SqsUseCase } from "./sqs";
