import { NextApiUseCase } from "@megawin/next/server";
import { EntryOutstandingRepository } from "../../infras/repos/entry-outstanding-repo";
import type {
  ListOutstandingPlayerEntriesInput,
  ListOutstandingPlayerEntriesOutput,
} from "./types";

/**
 * Lấy danh sách entries outstanding của 1 player trong 1 draw × tenant. Drill cấp 4.
 *
 * Trả về full TicketEntryEntity để EntryDetailDialog có thể hiển thị
 * chi tiết boards. sort: createdAt DESC (mới nhất trước).
 * Index: { drawId: 1, "tenant.tenantId": 1, accountId: 1 }
 */
export class ListOutstandingPlayerEntriesUseCase extends NextApiUseCase<
  ListOutstandingPlayerEntriesInput,
  ListOutstandingPlayerEntriesOutput
> {
  private readonly repo = new EntryOutstandingRepository();

  protected async execute(
    input: ListOutstandingPlayerEntriesInput,
  ): Promise<ListOutstandingPlayerEntriesOutput> {
    const data = await this.repo.findEntriesByDrawTenantPlayer(
      input.drawId,
      input.tenantId,
      input.accountId,
    );
    return { data };
  }
}
