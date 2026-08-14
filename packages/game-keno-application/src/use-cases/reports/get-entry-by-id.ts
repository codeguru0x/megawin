import { UseCase } from "@megawin/app-core/use-cases";
import { AppException } from "@megawin/shared/errors";

import { EntryRepository } from "../../infras/repos/entry-repo";
import type { GetEntryByIdInput, GetEntryByIdOutput } from "./types";

/**
 * Lấy chi tiết 1 entry Keno theo entryId.
 *
 * Dùng cho dialog chi tiết entry từ Winning Entries Dialog (operations),
 * hoặc bất kỳ nơi nào cần xem đầy đủ 1 entry cụ thể.
 */
export class GetEntryByIdUseCase extends UseCase<GetEntryByIdInput, GetEntryByIdOutput> {
  private readonly entryRepo = new EntryRepository();

  protected async execute(input: GetEntryByIdInput): Promise<GetEntryByIdOutput> {
    const entry = await this.entryRepo.getEntryById(input.entryId);
    if (!entry) {
      throw AppException.notFound("Không tìm thấy phiếu cược");
    }
    return { entry };
  }
}
