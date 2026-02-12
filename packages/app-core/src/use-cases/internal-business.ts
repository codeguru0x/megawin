/**
 * Use case cho internal business – logic nghiệp vụ thuần.
 * Nhận DTO trực tiếp (không qua AWS event).
 */

import { BaseUseCase } from "./base";

/** Use case nghiệp vụ thuần – nhận DTO, dùng run() chung. */
export abstract class InternalBusinessUseCase<I, O> extends BaseUseCase<I, O> {}
