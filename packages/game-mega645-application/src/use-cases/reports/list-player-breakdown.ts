import { NextApiUseCase } from "@megawin/next/server";

import { EntryRepository } from "../../infras/repos/entry-repo";
import type { ListPlayerBreakdownInput, ListPlayerBreakdownOutput } from "./types";

/** Aggregate players cho 1 draw × 1 tenant. Drill cấp 3. */
export class ListPlayerBreakdownUseCase extends NextApiUseCase<ListPlayerBreakdownInput, ListPlayerBreakdownOutput> {
  private readonly repo = new EntryRepository();
  protected async execute(input: ListPlayerBreakdownInput): Promise<ListPlayerBreakdownOutput> {
    return { data: await this.repo.aggregatePlayersByDrawAndTenant(input.drawId, input.tenantId) };
  }
}
