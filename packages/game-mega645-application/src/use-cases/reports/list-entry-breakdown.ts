import { UseCase } from "@megawin/app-core/use-cases";

import { EntryRepository } from "../../infras/repos/entry-repo";
import type { ListEntryBreakdownInput, ListEntryBreakdownOutput } from "./types";

/** Entries cho 1 player × 1 draw × 1 tenant. Drill cấp 4. */
export class ListEntryBreakdownUseCase extends UseCase<ListEntryBreakdownInput, ListEntryBreakdownOutput> {
  private readonly repo = new EntryRepository();
  protected async execute(input: ListEntryBreakdownInput): Promise<ListEntryBreakdownOutput> {
    return {
      data: await this.repo.findByDrawTenantPlayer(input.drawId, input.tenantId, input.accountId),
    };
  }
}
