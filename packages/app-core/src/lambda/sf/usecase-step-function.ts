/**
 * Use case cho AWS Step Functions (Lambda task / state machine).
 * Input/Output thường là JSON pass-through giữa các state.
 * Có thể validate bằng Zod trong validate() hoặc code riêng.
 */

import { BaseUseCase } from "../../application/usecase/usecase-base";

// ============ Types ============

/** Input chuẩn từ Step Functions (Lambda invocation). */
export interface StepFunctionInput<T = unknown> {
  /** Payload từ state trước hoặc input ban đầu. */
  payload?: T;
  /** Có thể có thêm metadata từ Step Functions. */
  [key: string]: unknown;
}

/** Output trả về cho Step Functions (sẽ làm input state tiếp theo). */
export type StepFunctionOutput<T = unknown> = T;

// ============ StepFunctionUseCase ============

/**
 * Base use case nhận input từ Step Functions Lambda.
 * parseInput: lấy event.payload hoặc toàn bộ event làm I.
 * Override parseInput/validate (Zod hoặc tùy chọn) khi cần.
 */
export abstract class StepFunctionUseCase<I, O> extends BaseUseCase<I, O> {
  protected parseInput(raw: unknown): I {
    const event = raw as StepFunctionInput<I>;
    return (event.payload ?? event) as I;
  }
}
