/**
 * Use case cho AWS SNS.
 * Nhận DTO đã được handler/middleware parse từ SNS message.
 */

import { BaseUseCase } from "./base";

/** Use case cho SNS – nhận DTO đã parse, dùng run() chung. */
export abstract class SnsUseCase<I, O> extends BaseUseCase<I, O> {}
