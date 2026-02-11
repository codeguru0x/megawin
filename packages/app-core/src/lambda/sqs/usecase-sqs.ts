/**
 * Use case cho AWS SQS.
 * Input từ SQS message (body string hoặc parsed JSON).
 * Có thể validate bằng Zod trong validate() hoặc code riêng.
 */

import { BaseUseCase } from "#application/usecase/usecase-base";

// ============ Types ============

/** SQS message (phần dùng trong use case). Có thể extend theo AWS SDK. */
export interface SqsMessagePayload {
  body: string;
  messageId?: string;
  receiptHandle?: string;
  /** Parsed body nếu là JSON (set bởi parseInput hoặc middleware). */
  parsed?: unknown;
}

// ============ Helpers ============

/** Parse SQS body string thành object (JSON). Nếu không phải JSON thì trả về body gốc. */
export function parseSqsBody<T = unknown>(body: string): T {
  try {
    return JSON.parse(body) as T;
  } catch {
    return body as unknown as T;
  }
}

// ============ SqsUseCase ============

/**
 * Base use case nhận raw SQS event (Lambda).
 * parseInput: lấy Records[0].body, parse JSON nếu được, trả về I.
 * Override parseInput nếu cần map phức tạp hơn; override validate (Zod hoặc tùy chọn).
 */
export abstract class SqsUseCase<I, O> extends BaseUseCase<I, O> {
  protected parseInput(raw: unknown): I {
    const event = raw as {
      Records?: Array<{ body?: string }>;
    };
    const body = event.Records?.[0]?.body ?? "";
    return parseSqsBody<I>(body) as I;
  }
}
