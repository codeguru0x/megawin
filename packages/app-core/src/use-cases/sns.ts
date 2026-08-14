/**
 * Use case cho AWS SNS.
 * Nhận DTO đã được handler/middleware parse từ SNS message.
 */

import { UseCase } from "./use-case";

/**
 * Use case cho SNS – nhận DTO đã parse, dùng `run()`/`safeRun()` chung của {@link UseCase}.
 *
 * ⚠️ ĐỔI NGỮ NGHĨA (Phase 4 migrate use-case): trước kế thừa `BaseUseCase` (`run()` trả
 * `AppResult<O>`, không throw). Nay `run()` trả **raw** `O` và **THROW** `AppException`;
 * bản không-throw là `safeRun()`.
 *
 * Không có consumer nào tại thời điểm chuyển đổi — giữ làm building block cho worker SNS
 * tương lai, cùng nhóm với parser middleware ở `app-core/lambda/middleware`.
 */
export abstract class SnsUseCase<I, O> extends UseCase<I, O> {}
