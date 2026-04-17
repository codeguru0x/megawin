export interface TicketLookupService {
  /**
   * Kiểm tra ticket tồn tại theo transaction ID (UUIDv7).
   *
   * Recovery flow:
   * 1. Scheduler tìm orphan WAL (DEBIT_PENDING > 30s)
   * 2. Confirm debit = success (tenant đã trừ tiền)
   * 3. Gọi existsByTx(tx) → exists? markCompleted : rollback credit
   *
   * @param tx - Transaction ID (UUIDv7) gắn vào ticketDoc.tx khi place-bet
   */
  existsByTx(tx: string): Promise<boolean>;
}
