import { NextApiUseCase } from "@megawin/next/server";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { getFinancialDateToday } from "./helpers";
import type { GetTripletFrequencyInput, TripletFrequencyOutput } from "./dto/operations.dto";

/**
 * Lấy top N bộ ba số phổ biến nhất cho dashboard vận hành Max 3D Pro.
 *
 * Không gian mẫu là 1000 bộ ba (000-999) — quá lớn để hiển thị toàn bộ.
 * Trả về top N (mặc định 20) bộ ba phổ biến nhất theo số lần chọn giảm dần.
 *
 * Pipeline: unwind boards → unwind triplets → group by triplet → sort desc → limit.
 * Max 3D Pro: triplets từ cả multiNumber và multiDigit boards (expand lúc settle,
 * nhưng entrySummary.boards.triplets lưu danh sách triplets gốc người chơi chọn).
 */
export class GetTripletFrequencyUseCase extends NextApiUseCase<
  GetTripletFrequencyInput,
  TripletFrequencyOutput
> {
  private readonly entryRepo = new EntryRepository();

  protected async execute(input: GetTripletFrequencyInput): Promise<TripletFrequencyOutput> {
    const financialDate = input.financialDate ?? getFinancialDateToday();
    const limit = Math.min(input.limit ?? 20, 50);
    const triplets = await this.entryRepo.aggregateTripletFrequency({
      financialDate,
      drawId: input.drawId,
      limit,
    });

    return { financialDate, triplets };
  }
}
