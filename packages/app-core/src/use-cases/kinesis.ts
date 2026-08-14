/**
 * Use case cho AWS Kinesis Data Streams.
 * Nhận DTO đã được handler/middleware parse từ Kinesis record.
 */

import { UseCase } from "./use-case";

/**
 * Use case cho Kinesis – nhận DTO đã parse, dùng `run()`/`safeRun()` chung của {@link UseCase}.
 *
 * ⚠️ ĐỔI NGỮ NGHĨA (Phase 4 migrate use-case): trước kế thừa `BaseUseCase` (`run()` trả
 * `AppResult<O>`, không throw). Nay `run()` trả **raw** `O` và **THROW** `AppException`;
 * bản không-throw là `safeRun()`.
 *
 * Không có consumer nào tại thời điểm chuyển đổi — giữ làm building block cho worker Kinesis
 * tương lai, cùng nhóm với parser middleware ở `app-core/lambda/middleware`.
 */
export abstract class KinesisUseCase<I, O> extends UseCase<I, O> {}
