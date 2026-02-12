/**
 * Entrypoint cho Middy middleware dùng trong Lambda.
 *
 * import {
 *   validatorZodMiddleware,
 *   authorizationMiddleware,
 *   httpErrorHandlerUseCaseFormat,
 *   kinesisParserMiddleware,
 *   sqsParserMiddleware,
 *   snsParserMiddleware,
 *   stepFunctionParserMiddleware,
 * } from "@megawin/app-core/lambda/middleware";
 */

/** Zod validator */
export {
  validatorZodMiddleware,
  formatZodError,
  type ApiGatewayZodSchemas,
} from "./validator-zod";

/** Authorization */
export {
  authorizationMiddleware,
  type ApiGatewayEventWithAuthContext,
} from "./authorization-middleware";

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
