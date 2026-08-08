/**
 * Entrypoint cho Middy middleware dùng trong Lambda.
 *
 * === Non-auth middleware (validator, error handler, parsers) ===
 * import { validatorZodMiddleware, httpErrorHandlerUseCaseFormat } from "@megawin/app-core/lambda/middleware";
 *
 * === Auth middleware — đã chuyển sang @megawin/auth ===
 * import { withPlayerAuth, withAgentAuth, withCompanyAuth } from "@megawin/auth";
 * import { withTenantAuth } from "@megawin/auth/tenant";
 */

/** Error handler */
export { httpErrorHandlerUseCaseFormat } from "./http-error-handler-use-case";
/** Kinesis parser */
export { kinesisParserMiddleware, parseKinesisData } from "./kinesis-parser";
/** SNS parser */
export { parseSnsMessage, snsParserMiddleware } from "./sns-parser";
/** SQS parser */
export { parseSqsBody, sqsParserMiddleware } from "./sqs-parser";
/** Step Function parser */
export { stepFunctionParserMiddleware } from "./step-function-parser";
/** Zod validator */
export {
  type ApiGatewayZodSchemas,
  type SchemaOf,
  validatorZodMiddleware,
} from "./validator-zod";
