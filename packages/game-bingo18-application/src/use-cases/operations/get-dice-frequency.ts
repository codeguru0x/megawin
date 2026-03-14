import { NextApiUseCase } from "@megawin/next/server";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { getFinancialDateToday } from "./helpers";
import { BINGO18_DICE_MIN, BINGO18_DICE_MAX } from "@megawin/game-bingo18/entities";
import type { OpsQueryInput, DiceFrequencyOutput, DiceFrequencyItem } from "./dto/operations.dto";

/**
 * Tần suất xuất hiện 6 mặt xúc xắc (1-6) trong các basic boards.
 *
 * Bingo 18: 6 mặt (1-6), đơn giản hơn Keno (80 số) rất nhiều.
 * Chỉ aggregate từ singleNum + doubleMatch (có số cụ thể).
 * tripleMatch-any không có số cụ thể → không đưa vào heatmap.
 * Kết quả pad đủ 6 giá trị (kể cả mặt chưa được chọn → count = 0).
 */
export class GetDiceFrequencyUseCase extends NextApiUseCase<OpsQueryInput, DiceFrequencyOutput> {
  private readonly entryRepo = new EntryRepository();

  protected async execute(input: OpsQueryInput): Promise<DiceFrequencyOutput> {
    const financialDate = input.financialDate ?? getFinancialDateToday();
    const raw = await this.entryRepo.aggregateDiceFrequency({
      financialDate,
      drawId: input.drawId,
    });

    // Đảm bảo trả đủ 6 mặt xúc xắc (1-6), pad 0 nếu mặt chưa được chọn
    const freqMap = new Map(raw.map((r) => [r.diceValue, r]));
    const dice: DiceFrequencyItem[] = [];
    for (let v = BINGO18_DICE_MIN; v <= BINGO18_DICE_MAX; v++) {
      const existing = freqMap.get(v);
      dice.push({
        diceValue: v,
        count: existing?.count ?? 0,
        entries: existing?.entries ?? 0,
      });
    }

    return { financialDate, dice };
  }
}
