/**
 * Entry cho AWS trong app-core.
 *
 * - Cấu hình chung (region, credentials): import từ `./config`.
 * - Mỗi sản phẩm có module riêng:
 *   - Cognito: import từ `./cognito`
 *   - SQS: import từ `./sqs`
 *   - Kinesis: import từ `./kinesis`
 *
 * Việc tách module giúp chỉ khởi tạo singleton và kiểm tra env
 * khi bạn thực sự import sản phẩm tương ứng.
 */

export * from "./config";
