/**
 * Use case cho AWS SQS.
 * Nhận DTO đã được handler/middleware parse từ SQS message body.
 */

import { BaseUseCase } from "./base";

/** Use case cho SQS – nhận DTO đã parse, dùng run() chung. */
export abstract class SqsUseCase<I, O> extends BaseUseCase<I, O> {}
