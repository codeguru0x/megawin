import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";

import { EntryRepository } from "../../infras/repos/entry-repo";
import type { GetEntryByIdInput, GetEntryByIdOutput } from "./types";

/**
 * Lấy chi tiết 1 entry Lotto 5/35 theo entryId.
 *
 * Dùng cho dialog chi tiết entry từ màn hình Jackpot winner,
 * hoặc bất kỳ nơi nào cần xem đầy đủ 1 entry cụ thể.
 */
export class GetEntryByIdUseCase extends NextApiUseCase<GetEntryByIdInput, GetEntryByIdOutput> {
  private readonly entryRepo = new EntryRepository();

  protected async execute(input: GetEntryByIdInput): Promise<GetEntryByIdOutput> {
    const entry = await this.entryRepo.getEntryById(input.entryId);
    if (!entry) {
      throw AppException.notFound("Không tìm thấy phiếu cược ");
    }
    return { entry };
  }
}
