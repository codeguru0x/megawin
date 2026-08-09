import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";

import { EntryRepository } from "../../infras/repos/entry-repo";
import type { GetEntryByIdInput, GetEntryByIdOutput } from "./types";

export class GetEntryByIdUseCase extends NextApiUseCase<GetEntryByIdInput, GetEntryByIdOutput> {
  private readonly entryRepo = new EntryRepository();

  protected async execute(input: GetEntryByIdInput): Promise<GetEntryByIdOutput> {
    const entry = await this.entryRepo.getEntryById(input.entryId);
    if (!entry) {
      throw AppException.notFound("Không tìm thấy phiếu cược");
    }
    return { entry };
  }
}
