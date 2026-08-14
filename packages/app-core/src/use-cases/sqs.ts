/**
 * Use case cho AWS SQS.
 * Nhận DTO đã được handler/middleware parse từ SQS message body.
 */

import { UseCase } from "./use-case";

/**
 * Use case cho SQS – nhận DTO đã parse, dùng `run()`/`safeRun()` chung của {@link UseCase}.
 *
 * ⚠️ ĐỔI NGỮ NGHĨA (Phase 4 migrate use-case): trước đây class này kế thừa `BaseUseCase` với
 * `run()` trả `AppResult<O>` (không throw). Nay kế thừa `UseCase`:
 * - `run(input)`     → trả **raw** `O`, **THROW** `AppException` khi lỗi.
 * - `safeRun(input)` → trả `AppResult<O>`, không throw — tương đương `BaseUseCase.run()` cũ.
 *
 * Với worker SQS, `run()` (throw) thường là thứ bạn muốn: lỗi phải nổi lên thành Lambda error
 * để SQS retry / đẩy vào DLQ. Dùng `safeRun()` khi cần tự quyết định partial-batch failure.
 *
 * Không có consumer nào tại thời điểm chuyển đổi (0 class extends) — giữ lại làm building block
 * cho worker SQS tương lai, cùng nhóm với các parser middleware ở `app-core/lambda/middleware`.
 */
export abstract class SqsUseCase<I, O> extends UseCase<I, O> {}
