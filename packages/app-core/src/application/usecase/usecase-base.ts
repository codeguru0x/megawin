/**
 * Base use case – shared standard for the project.
 * Core types and abstract base: parseInput → validate → execute → UseCaseResult<O>.
 * Các use case theo đối tượng (API Gateway, SNS, Kinesis, SQS, Step Function, Business)
 * nằm ở file riêng và extend BaseUseCase.
 */

// ============ Result & Error (chuẩn output) ============

export const USE_CASE_ERROR_CODES = {
  /** Lỗi validate input (body, params, format) */
  VALIDATION: "VALIDATION",
  /** Không tìm thấy resource */
  NOT_FOUND: "NOT_FOUND",
  /** Chưa xác thực */
  UNAUTHORIZED: "UNAUTHORIZED",
  /** Không có quyền */
  FORBIDDEN: "FORBIDDEN",
  /** Xung đột (trùng, conflict) */
  CONFLICT: "CONFLICT",
  /** Lỗi hệ thống */
  INTERNAL: "INTERNAL",
} as const;

export type UseCaseErrorCode =
  (typeof USE_CASE_ERROR_CODES)[keyof typeof USE_CASE_ERROR_CODES];

export interface UseCaseError {
  code: UseCaseErrorCode;
  message: string;
  /** Chi tiết thêm (field lỗi, stack, ...) */
  details?: unknown;
}

/** Kết quả chuẩn: success + data hoặc error */
export type UseCaseResult<T> =
  | { success: true; data: T }
  | { success: false; error: UseCaseError };

export function isUseCaseError(err: unknown): err is UseCaseError {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    "message" in err
  );
}

// ============ Base Use Case ============

/**
 * Base use case dùng chung cho toàn dự án.
 * - parseInput: chuyển raw input (event AWS hoặc DTO) thành input nghiệp vụ I.
 * - validate: kiểm tra input (return UseCaseError để fail).
 * - execute: logic nghiệp vụ, trả về output O.
 * - run: parse → validate → execute, trả về UseCaseResult<O>.
 */
export abstract class BaseUseCase<I, O> {
  /**
   * Parse raw input thành business input I.
   * Override trong use case cụ thể (API Gateway, SNS, Kinesis, SQS, Step Function, Business).
   */
  protected abstract parseInput(raw: unknown): I;

  /**
   * Validate input. Return UseCaseError để fail, void để tiếp tục.
   * Có thể dùng Zod trong override hoặc validate thủ công.
   */
  protected validate(_input: I): void | UseCaseError {
    return undefined;
  }

  /**
   * Logic nghiệp vụ. Implement trong use case cụ thể.
   */
  protected abstract execute(input: I): Promise<O>;

  /**
   * Chạy use case: parse → validate → execute, trả về kết quả chuẩn.
   */
  async run(raw: unknown): Promise<UseCaseResult<O>> {
    try {
      const input = this.parseInput(raw);
      const validationError = this.validate(input);
      if (validationError) {
        return { success: false, error: validationError };
      }
      const output = await this.execute(input);
      return { success: true, data: output };
    } catch (err) {
      return this.handleError(err);
    }
  }

  protected handleError(err: unknown): UseCaseResult<O> {
    if (isUseCaseError(err)) {
      return { success: false, error: err };
    }
    return {
      success: false,
      error: {
        code: USE_CASE_ERROR_CODES.INTERNAL,
        message: err instanceof Error ? err.message : "Unknown error",
        details: err,
      },
    };
  }
}
