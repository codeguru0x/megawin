import type { TicketDoc, TicketEntryDoc } from "@megawin/game-bingo18/entities";
import { TicketRepository } from "./ticket-repo";
import { EntryRepository } from "./entry-repo";

/**
 * Atomic write coordinator cho place-bet — Bingo 18.
 *
 * Không phải Repository; không query DB.
 * Trách nhiệm duy nhất: insert ticket + entries trong 1 MongoDB transaction.
 *
 * Transaction đảm bảo vì cả hai repo dùng cùng `mongoEnvKey` ("MONGODB_URI")
 * → cùng `MongoClient` instance → session do `TicketRepository.withTransaction`
 * tạo ra hoạt động đúng trên cả hai collections.
 *
 * Yêu cầu: MongoDB Atlas M10+ hoặc Dedicated cluster (M0 free tier không hỗ trợ transaction).
 */
export class PlaceBetStore {
  private readonly ticketRepo = new TicketRepository();
  private readonly entryRepo = new EntryRepository();

  /**
   * Insert ticket + entries trong 1 MongoDB transaction (atomic).
   *
   * Nếu bất kỳ insert nào fail → cả 2 collections đều rollback.
   * ticketId được sinh client-side trước khi gọi → entries đã nhúng sẵn ticketId.
   *
   * version được stamp cho toàn bộ batch entries trước khi insert.
   */
  async saveAtomically(
    ticketDoc: TicketDoc,
    entryDocs: Array<Omit<TicketEntryDoc, "_id" | "version">>,
  ): Promise<void> {
    if (entryDocs.length === 0) {
      throw new Error("entryDocs must not be empty.");
    }

    // Lấy version sequence bên ngoài transaction — seqRepo dùng $inc idempotent,
    // không cần nằm trong transaction. Lấy trước để tránh I/O thừa bên trong transaction.
    const version = await this.entryRepo.nextVersion();
    const stampedEntries = entryDocs.map((doc) => ({ ...doc, version }));

    await this.ticketRepo.withTransaction(async (session) => {
      await this.ticketRepo.insertOne(ticketDoc as any, { session });
      await this.entryRepo.insertMany(stampedEntries as any[], { session });
    });
  }
}
