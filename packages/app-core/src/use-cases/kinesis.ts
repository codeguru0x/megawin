/**
 * Use case cho AWS Kinesis Data Streams.
 * Nhận DTO đã được handler/middleware parse từ Kinesis record.
 */

import { BaseUseCase } from "./base";

/** Use case cho Kinesis – nhận DTO đã parse, dùng run() chung. */
export abstract class KinesisUseCase<I, O> extends BaseUseCase<I, O> {}
