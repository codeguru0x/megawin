/**
 * Bingo18TicketLookupService — kiểm tra ticket tồn tại theo transaction ID.
 *
 * Recovery scheduler (RecoverOrphanTxIntentsUseCase) dùng service này để xác định
 * ticket đã được save thành công sau khi confirm debit = success.
 *
 * Tách thành service riêng (thay vì dùng repo trực tiếp từ worker) để:
 * 1. Giữ đúng architecture: worker → use-case/service → repo (không bypass)
 * 2. Dễ thêm logic (audit log, cache...) mà không sửa repo
 * 3. Mỗi game tự quản lý cách check ticket — decoupled khỏi worker
 */

import { TicketRepository } from "../infras/repos/ticket-repo";
import type { TicketLookupService } from "@megawin/game-core-application/services";

export class Bingo18TicketLookupService implements TicketLookupService {
  private readonly ticketRepo = new TicketRepository();

  /** @inheritdoc */
  async existsByTx(tx: string): Promise<boolean> {
    return await this.ticketRepo.existsByTx(tx);
  }
}
