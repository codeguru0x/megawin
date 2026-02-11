/**
 * Use case cho AWS Kinesis Data Streams.
 * Input từ Kinesis record (base64 data).
 * Có thể validate bằng Zod trong validate() hoặc code riêng.
 */

import {
  USE_CASE_ERROR_CODES,
  UseCaseError,
  BaseUseCase,
} from "#application/usecase/usecase-base";

// ============ Types ============

/** Kinesis record (phần dùng trong use case). */
export interface KinesisRecordPayload {
  data: string; // base64
  partitionKey?: string;
  sequenceNumber?: string;
}

// ============ Helpers ============

/** Decode Kinesis data (base64) thành string rồi parse JSON. Throw UseCaseError nếu invalid. */
export function parseKinesisData<T = unknown>(data: string): T {
  try {
    const decoded = Buffer.from(data, "base64").toString("utf-8");
    return JSON.parse(decoded) as T;
  } catch {
    throw {
      code: USE_CASE_ERROR_CODES.VALIDATION,
      message: "Invalid Kinesis data",
    } satisfies UseCaseError;
  }
}

// ============ KinesisUseCase ============

/**
 * Base use case nhận raw Kinesis event (Lambda).
 * parseInput: lấy Records[0].kinesis.data, decode base64 + JSON, trả về I.
 */
export abstract class KinesisUseCase<I, O> extends BaseUseCase<I, O> {
  protected parseInput(raw: unknown): I {
    const event = raw as {
      Records?: Array<{ kinesis?: { data?: string } }>;
    };
    const data = event.Records?.[0]?.kinesis?.data ?? "";
    return parseKinesisData<I>(data) as I;
  }
}
