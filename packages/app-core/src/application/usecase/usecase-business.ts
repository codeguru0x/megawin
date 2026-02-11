/**
 * Use case cho business – chỉ input/output nghiệp vụ (không qua AWS event).
 * Có thể validate bằng Zod trong override validate() hoặc code riêng.
 */

import { BaseUseCase } from "./usecase-base";

/**
 * Use case chỉ dùng input/output nghiệp vụ.
 * parseInput mặc định coi raw là I; override để parse/validate (vd Zod) nếu cần.
 */
export abstract class BusinessUseCase<I, O> extends BaseUseCase<I, O> {
  protected parseInput(raw: unknown): I {
    return raw as I;
  }
}
