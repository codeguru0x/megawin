/**
 * Use case cho AWS SNS.
 * Input từ SNS message (Message string hoặc parsed JSON).
 * Có thể validate bằng Zod trong validate() hoặc code riêng.
 */

import { BaseUseCase } from "#application/usecase/usecase-base";

// ============ Types ============

/** Message SNS (phần dùng trong use case). Có thể extend theo AWS SDK. */
export interface SnsMessagePayload {
  Message: string;
  MessageId?: string;
  Subject?: string;
  TopicArn?: string;
  /** Parsed body nếu Message là JSON (set bởi parseInput hoặc middleware). */
  parsed?: unknown;
}

/** Input đã parse từ SNS record. */
export type SnsParsedInput<T = unknown> = T;

// ============ Helpers ============

/** Parse SNS Message string thành object (JSON). Nếu không phải JSON thì trả về message gốc. */
export function parseSnsMessage<T = unknown>(message: string): T {
  try {
    return JSON.parse(message) as T;
  } catch {
    return message as unknown as T;
  }
}

// ============ SnsUseCase ============

/**
 * Base use case nhận raw SNS event (Lambda).
 * parseInput: lấy Records[0].Sns.Message, parse JSON nếu được, trả về I.
 * Override parseInput nếu cần map phức tạp hơn; override validate (Zod hoặc tùy chọn).
 */
export abstract class SnsUseCase<I, O> extends BaseUseCase<I, O> {
  /** Raw event shape từ Lambda SNS trigger. */
  protected parseInput(raw: unknown): I {
    const event = raw as {
      Records?: Array<{ Sns?: { Message?: string } }>;
    };
    const message = event.Records?.[0]?.Sns?.Message ?? "";
    return parseSnsMessage<I>(message) as I;
  }
}
