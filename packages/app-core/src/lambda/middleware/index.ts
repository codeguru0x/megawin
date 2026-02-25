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

/** Zod validator */
export {
  validatorZodMiddleware,
  type ApiGatewayZodSchemas,
  type SchemaOf,
} from "./validator-zod";

/** Error handler */
export { httpErrorHandlerUseCaseFormat } from "./http-error-handler-use-case";

/** Kinesis parser */
export { kinesisParserMiddleware, parseKinesisData } from "./kinesis-parser";

/** SQS parser */
export { sqsParserMiddleware, parseSqsBody } from "./sqs-parser";

/** SNS parser */
export { snsParserMiddleware, parseSnsMessage } from "./sns-parser";

/** Step Function parser */
export { stepFunctionParserMiddleware } from "./step-function-parser";
