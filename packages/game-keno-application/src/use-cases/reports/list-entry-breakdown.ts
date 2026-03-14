import { NextApiUseCase } from "@megawin/next/server";
import { EntryRepository } from "../../infras/repos/entry-repo";
import type { ListEntryBreakdownInput, ListEntryBreakdownOutput } from "./types";

/**
 * Lấy entries của 1 player trong 1 draw × tenant — drill-down level 4.
 */
export class ListEntryBreakdownUseCase extends NextApiUseCase<
  ListEntryBreakdownInput,
  ListEntryBreakdownOutput
> {
  private readonly repo = new EntryRepository();

  protected async execute(input: ListEntryBreakdownInput): Promise<ListEntryBreakdownOutput> {
    const data = await this.repo.findByDrawTenantPlayer(
      input.drawId,
      input.tenantId,
      input.accountId,
    );
    return { data };
  }
}
