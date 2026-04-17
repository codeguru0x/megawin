/**
 * Tập trung tất cả callback URL paths của tenant gateway.
 *
 * Mỗi path là hậu tố ghép sau `callbackBaseUrl` của tenant.
 * Ví dụ: `https://api.tenant.com` + `/transaction`
 *
 * Gom 1 chỗ để:
 * - Dễ tra cứu, tránh duplicate literal strings giữa balance-api / transaction-api.
 * - Dễ đổi prefix nếu tương lai tenant yêu cầu custom path.
 */
export const CALLBACK_PATHS = {
  /** `GET /balance?playerId={id}&currency=VND` */
  balance: "/balance",

  /** `POST /transaction` — single debit/credit. */
  transaction: "/transaction",

  /** `POST /transaction/batch` — batch payout/refund. */
  batchTransaction: "/transaction/batch",

  /**
   * `GET /transaction/:tx/status` — check transaction status.
   *
   * Read-only — không tạo/sửa giao dịch. Recovery scheduler dùng để xác nhận
   * tenant đã xử lý debit chưa trước khi quyết định rollback.
   *
   * Caller thay `:tx` bằng transaction ID thực tế.
   */
  transactionStatus: "/transaction/:tx/status",
} as const;
