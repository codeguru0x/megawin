/**
 * Use cases – chỉ chứa business logic.
 *
 * Error system (AppError, AppException, APP_ERROR_CODES) sống ở @megawin/shared/errors.
 * Re-export ở đây cho tiện.
 */

/** Error system (từ @megawin/shared/errors) */
export {
  APP_ERROR_CODES,
  type AppErrorCode,
  type AppError,
  type AppResult,
  isAppError,
  AppException,
  type AppExceptionOptions,
  errorCodeToStatusCode,
  appErrorToStatusCode,
  toHttpErrorResponse,
  type HttpErrorBody,
  type HttpErrorResponse,
} from "@megawin/shared/errors";

/** Legacy aliases */
export {
  USE_CASE_ERROR_CODES,
  type UseCaseErrorCode,
  type UseCaseError,
  type UseCaseResult,
  isUseCaseError,
  UseCaseException,
  BaseUseCase,
} from "./base";

/** API Gateway */
export {
  type ApiGatewayResponse,
  useCaseErrorToStatusCode,
  toApiGatewayResponse,
  ApiGatewayUseCase,
} from "./api-gateway";

/** Internal Business */
export { InternalBusinessUseCase as BusinessUseCase } from "./internal-business";

/** Kinesis */
export { KinesisUseCase } from "./kinesis";

/** SQS */
export { SqsUseCase } from "./sqs";

/** SNS */
export { SnsUseCase } from "./sns";

/** Step Functions */
export { StepFunctionUseCase } from "./step-function";
