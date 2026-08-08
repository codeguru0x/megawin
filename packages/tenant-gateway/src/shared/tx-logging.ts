/**
 * Shared singleton instances cho transaction logging — dùng chung bởi mọi API
 * trong tenant-gateway cần ghi audit log (hiện tại: Transaction API).
 *
 * ## Tại sao là module-level singleton?
 *
 * - Use case **không giữ state phụ thuộc tenant** — cùng 1 instance phục vụ
 *   mọi tenant. Tạo per-tenant chỉ lãng phí RAM (mỗi `createTenantGatewayClient`
 *   chạy per-tenant qua LRU cache, hàng trăm tenant có thể cùng active).
 *
 * - `TxLogRepository` bên trong use case lazy-connect đến Mongo pool
 *   (share từ `@megawin/data`) — không tốn connection khi chưa dùng.
 *
 * - Đồng nhất với pattern toàn codebase: mọi use case đều được khởi tạo singleton
 *   tại module cấp cao nhất (worker handler, API route, factory module).
 *
 * ## Khi nào import từ đây?
 *
 * - Các API factory trong `tenant-gateway` cần log audit (VD `createTransactionApi`).
 * - **KHÔNG** import từ ứng dụng ngoài (`apps/*`) — họ nên dùng read-side use cases
 *   (`ListTxLogsUseCase`, `GetTxLogByTxUseCase`, ...) thay vì write-side.
 *
 * @internal
 */

import { LogTxBulkUseCase, LogTxUseCase } from "../use-cases/tx-logs/write";

/**
 * Singleton cho log 1 transaction đơn lẻ.
 *
 * Fire-and-forget: caller phải dùng `void logTxUseCase.run(...)` để không block
 * main flow. Insert error được repo tự swallow + `console.error` bên trong
 * use case — không throw ra ngoài.
 */
export const logTxUseCase = new LogTxUseCase();

/**
 * Singleton cho log batch (N docs cùng `batchId`).
 *
 * Fire-and-forget như {@link logTxUseCase}. Dùng `insertMany` với `ordered: false`
 * để không fail cả batch khi 1 doc bị duplicate key.
 */
export const logTxBulkUseCase = new LogTxBulkUseCase();
