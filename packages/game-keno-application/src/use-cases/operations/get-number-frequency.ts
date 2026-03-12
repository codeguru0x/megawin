import { NextApiUseCase } from "@megawin/next/server";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { getFinancialDateToday } from "./helpers";
import type {
  GetNumberFrequencyInput,
  NumberFrequencyOutput,
  NumberFrequencyItem,
} from "./dto/operations.dto";

/**
 * Tần suất xuất hiện của 80 số Keno trong các basic boards.
 *
 * Keno: 80 số (01-80), quay 20 số/kỳ.
 * Pipeline nặng (unwind boards → unwind numbers) — lazy-load trên UI.
 * Kết quả sorted theo number asc để map vào heatmap grid 10×8.
 */
export class GetNumberFrequencyUseCase extends NextApiUseCase<
  GetNumberFrequencyInput,
  NumberFrequencyOutput
> {
  private readonly entryRepo = new EntryRepository();

  protected async execute(input: GetNumberFrequencyInput): Promise<NumberFrequencyOutput> {
    const financialDate = input.financialDate ?? getFinancialDateToday();
    const raw = await this.entryRepo.aggregateNumberFrequency({
      financialDate,
      drawId: input.drawId,
    });

    // Đảm bảo trả đủ 80 số (nếu số nào chưa được chọn → count = 0)
    const freqMap = new Map(raw.map((r) => [r.number, r]));
    const numbers: NumberFrequencyItem[] = [];
    for (let i = 1; i <= 80; i++) {
      const n = String(i).padStart(2, "0");
      const existing = freqMap.get(n);
      numbers.push({
        number: n,
        count: existing?.count ?? 0,
        entries: existing?.entries ?? 0,
        revenue: existing?.revenue ?? 0,
      });
    }

    return { financialDate, numbers };
  }
}
