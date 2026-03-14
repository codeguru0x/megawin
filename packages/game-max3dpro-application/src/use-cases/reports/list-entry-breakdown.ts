import { NextApiUseCase } from "@megawin/next/server";
import { EntryRepository } from "../../infras/repos/entry-repo";
import type { ListEntryBreakdownInput, ListEntryBreakdownOutput } from "./types";

/**
 * List entries của 1 player trong 1 draw × tenant — drill-down cấp 4.
 *
 * Trả TicketEntryDoc thô để UI hiển thị chi tiết cặp bộ ba, giải trúng (8 hạng).
 */
export class ListEntryBreakdownUseCase extends NextApiUseCase<
  ListEntryBreakdownInput,
  ListEntryBreakdownOutput
> {
  private readonly repo = new EntryRepository();

  protected async execute(input: ListEntryBreakdownInput): Promise<ListEntryBreakdownOutput> {
    const data = await this.repo.findByDrawTenantPlayer({
      drawId: input.drawId,
      tenantId: input.tenantId,
      accountId: input.accountId,
    });
    return { data };
  }
}
