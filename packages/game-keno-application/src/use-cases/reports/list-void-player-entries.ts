import { UseCase } from "@megawin/app-core/use-cases";

import { EntryVoidRepository } from "../../infras/repos/entry-void-repo";
import type { ListVoidPlayerEntriesInput, ListVoidPlayerEntriesOutput } from "./types";

/**
 * Lấy danh sách entries void của 1 player trong 1 draw × tenant. Drill cấp 4.
 *
 * Trả về full TicketEntryEntity để EntryDetailDialog có thể hiển thị
 * chi tiết boards. sort: createdAt DESC (mới nhất trước).
 * Index: { drawId: 1, tenantId: 1, accountId: 1 }
 */
export class ListVoidPlayerEntriesUseCase extends UseCase<ListVoidPlayerEntriesInput, ListVoidPlayerEntriesOutput> {
  private readonly repo = new EntryVoidRepository();

  protected async execute(input: ListVoidPlayerEntriesInput): Promise<ListVoidPlayerEntriesOutput> {
    const data = await this.repo.findEntriesByDrawTenantPlayer(input.drawId, input.tenantId, input.accountId);
    return { data };
  }
}
