/**
 * Use case cho AWS Step Functions (Lambda task / state machine).
 * Nhận DTO đã được handler/middleware parse từ Step Functions event.
 */

import { BaseUseCase } from "./base";

/** Use case cho Step Functions – nhận DTO đã parse, dùng run() chung. */
export abstract class StepFunctionUseCase<I, O> extends BaseUseCase<I, O> {}
