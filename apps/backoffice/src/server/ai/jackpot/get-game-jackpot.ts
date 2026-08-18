/**
 * Use Case: Get Game Jackpot (mapper cho tool AI — p1-02 §3.4)
 *
 * Số ĐANG TÍCH LUỸ — khác hẳn `getGameConfig` (chỉ có mức seed lúc mở chu kỳ). Orchestration
 * (gọi 3 use-case package qua `tryLoad`) sống ở `GetCurrentJackpotsUseCase`
 * (`server/use-cases/jackpot/`) — class này CHỈ map RAW DTO đó sang `ConfigItem` (label/unit/note)
 * cho model đọc, KHÔNG tự gọi lại package. Dashboard card dùng CÙNG facade RAW nhưng map sang
 * shape khác (`app/api/dashboard/jackpots/_lib/get-dashboard-jackpots.ts`) — 2 mapper riêng vì 2
 * contract khác nhau, xem giải thích ở `get-current-jackpots.ts`.
 *
 * ĐẶT Ở `server/ai/jackpot/` (không phải `server/ai/game-config/` như trước): file này không đọc
 * field cấu hình nào, nó thuộc domain jackpot. Trước đây nó nằm lạc trong `game-config/` chỉ vì
 * cần `item()` — nay `item()` đã tách ra `../payload.ts` dùng chung mọi domain.
 *
 * Power 6/55 trả **2 khối** (JP1, JP2) — gộp vào 1 số là lỗi nghiệp vụ, xem `mapPower655Blocks`.
 */

import { UseCase } from "@megawin/app-core/use-cases";
import { JackpotGameProduct } from "@megawin/game-core/entities";
import { GAME_LABELS } from "@megawin/game-core/labels";

import { GetCurrentJackpotsUseCase } from "../../use-cases/jackpot/get-current-jackpots";
import type { Lotto535JackpotOutput, Mega645JackpotOutput, Power655JackpotOutput } from "../../use-cases/jackpot/types";
import { type ConfigItem, item } from "../payload";
import type { GetGameJackpotInput, GetGameJackpotOutput, JackpotBlock } from "./types";

function mapMega645Block(data: Mega645JackpotOutput, asOf: string): JackpotBlock {
  const { cycle } = data;
  const items: ConfigItem[] = [
    item(
      "cycle.currentAmount",
      "Jackpot đang tích luỹ",
      cycle.currentAmount,
      "vnd",
      `Đây là số hiện tại, đọc lúc ${asOf}. KHÔNG phải mức seed trong cấu hình.`,
    ),
    item("cycle.cycleNo", "Chu kỳ jackpot hiện tại", cycle.cycleNo, "count"),
    item("cycle.drawCount", "Số kỳ quay đã diễn ra trong chu kỳ này", cycle.drawCount, "count"),
    item("cycle.seedAmount", "Mức seed khi mở chu kỳ này", cycle.seedAmount, "vnd"),
  ];
  return {
    meta: { game: JackpotGameProduct.Mega645, gameLabel: GAME_LABELS[JackpotGameProduct.Mega645], asOf },
    items,
  };
}

function mapLotto535Block(data: Lotto535JackpotOutput, asOf: string): JackpotBlock {
  const { cycle, config } = data;
  const items: ConfigItem[] = [
    item(
      "cycle.currentAmount",
      "Jackpot đang tích luỹ",
      cycle.currentAmount,
      "vnd",
      `Đây là số hiện tại, đọc lúc ${asOf}. KHÔNG phải mức seed trong cấu hình.`,
    ),
    item("cycle.cycleNo", "Chu kỳ jackpot hiện tại", cycle.cycleNo, "count"),
    item("cycle.drawCount", "Số kỳ quay đã diễn ra trong chu kỳ này", cycle.drawCount, "count"),
    item("cycle.seedAmount", "Mức seed khi mở chu kỳ này", cycle.seedAmount, "vnd"),
    item(
      "config.splitThreshold",
      "Ngưỡng chia giải",
      config.splitThreshold,
      "vnd",
      "Lấy từ cấu hình, không phải số tích luỹ. Khi Jackpot đạt ngưỡng này mà chưa có người trúng, kỳ quay tối sẽ CHIA giải xuống tier1-5.",
    ),
  ];
  return {
    meta: { game: JackpotGameProduct.Lotto535, gameLabel: GAME_LABELS[JackpotGameProduct.Lotto535], asOf },
    items,
  };
}

function mapPower655Blocks(data: Power655JackpotOutput, asOf: string): JackpotBlock[] {
  const { cycle, config } = data;
  const gameLabel = GAME_LABELS[JackpotGameProduct.Power655];

  const jp1Items: ConfigItem[] = [
    item(
      "cycle.jackpot1CurrentAmount",
      "Jackpot 1 (trùng 6/6) đang tích luỹ",
      cycle.jackpot1CurrentAmount,
      "vnd",
      `Đây là số hiện tại, đọc lúc ${asOf}. KHÔNG phải mức seed trong cấu hình.`,
    ),
    item("cycle.jackpot1SeedAmount", "Mức seed JP1 khi mở chu kỳ này", cycle.jackpot1SeedAmount, "vnd"),
    item(
      "config.jp1OverflowThreshold",
      "Ngưỡng tràn JP1",
      config.jp1OverflowThreshold,
      "vnd",
      "Lấy từ cấu hình, không phải số tích luỹ. Khi JP1 vượt ngưỡng này, phần vượt được chuyển sang JP2.",
    ),
  ];
  const jp2Items: ConfigItem[] = [
    item(
      "cycle.jackpot2CurrentAmount",
      "Jackpot 2 (trùng 5/6 + bonus) đang tích luỹ",
      cycle.jackpot2CurrentAmount,
      "vnd",
      `Đây là số hiện tại, đọc lúc ${asOf}. KHÔNG phải mức seed trong cấu hình.`,
    ),
    item("cycle.jackpot2SeedAmount", "Mức seed JP2 khi mở chu kỳ này", cycle.jackpot2SeedAmount, "vnd"),
  ];
  const sharedItems: ConfigItem[] = [
    item("cycle.cycleNo", "Chu kỳ jackpot hiện tại", cycle.cycleNo, "count"),
    item("cycle.drawCount", "Số kỳ quay đã diễn ra trong chu kỳ này", cycle.drawCount, "count"),
  ];

  return [
    {
      meta: { game: JackpotGameProduct.Power655, gameLabel: `${gameLabel} — Jackpot 1`, asOf },
      items: [...jp1Items, ...sharedItems],
    },
    {
      meta: { game: JackpotGameProduct.Power655, gameLabel: `${gameLabel} — Jackpot 2`, asOf },
      items: [...jp2Items, ...sharedItems],
    },
  ];
}

export class GetGameJackpotUseCase extends UseCase<GetGameJackpotInput, GetGameJackpotOutput> {
  private readonly jackpots = new GetCurrentJackpotsUseCase();

  protected async execute(input: GetGameJackpotInput): Promise<GetGameJackpotOutput> {
    const asOf = new Date().toISOString();
    const games = input.game ? [input.game] : undefined;
    const { mega645, lotto535, power655 } = await this.jackpots.run({ games });

    const blocks: JackpotBlock[] = [
      ...(mega645 ? [mapMega645Block(mega645, asOf)] : []),
      ...(lotto535 ? [mapLotto535Block(lotto535, asOf)] : []),
      ...(power655 ? mapPower655Blocks(power655, asOf) : []),
    ];

    return { blocks };
  }
}
