/**
 * Use Case: Get Current Jackpots — facade RAW gộp 3 game có jackpot cycle (Mega645, Lotto535,
 * Power655), dùng chung giữa dashboard card và tool AI `getGameJackpot`.
 *
 * ĐẶT Ở ĐÂY (không phải `app/api/dashboard/jackpots/_lib/`, không phải `server/ai/`, không phải
 * package riêng) vì: (1) đây là orchestration CROSS-package của riêng backoffice — không app nào
 * khác cần cùng shape (§4 `app-use-case-layering.mdc`); (2) 2 consumer trong CHÍNH backoffice
 * (dashboard, AI tool) cần **shape output khác nhau thật** (dashboard cần `progressPercent` đã
 * tính sẵn, AI tool cần `ConfigItem[]` có `label`/`unit`/`note`) — gộp chung 1 class mapper là ép
 * 1 bên bóp méo dữ liệu, đúng cảnh báo ở §4. Vì vậy class này CHỈ orchestrate (gọi 3 use-case
 * package qua `tryLoad` + `Promise.all`) và trả RAW DTO — không quyết định shape hiển thị. Mỗi
 * consumer viết mapper riêng lên trên (`_lib/get-dashboard-jackpots.ts` cho dashboard,
 * `server/ai/jackpot/get-game-jackpot.ts` cho AI tool).
 *
 * KHÔNG chuyển file này vào `server/ai/`: nó phải giữ TRUNG LẬP với consumer. Hướng phụ thuộc là
 * `server/ai/**` → `server/use-cases/**`, một chiều — import ngược lại (hoặc nhét `ConfigItem` vào
 * đây) làm route dashboard phụ thuộc contract dành riêng cho model. Guard
 * `check-server-boundary.ts` chặn chiều ngược.
 *
 * KHÔNG tách thành package riêng: chỉ backoffice dùng, tách sớm tạo package 1-consumer
 * (§4). Nếu tương lai `apps/api-tenant` hoặc app khác cần đúng RAW DTO này → khi đó mới xét
 * tách `packages/game-core-application` (2 app cần CÙNG contract là ngưỡng tách, không phải
 * "có thể tái dùng").
 */

import { UseCase } from "@megawin/app-core/use-cases";
import { JackpotGameProduct } from "@megawin/game-core/entities";
import { GetJackpotCurrentUseCase as Lotto535JackpotUseCase } from "@megawin/game-lotto535-application/use-cases/jackpot";
import { GetJackpotCurrentUseCase as Mega645JackpotUseCase } from "@megawin/game-mega645-application/use-cases/jackpot";
import { GetJackpotCurrentUseCase as Power655JackpotUseCase } from "@megawin/game-power655-application/use-cases/jackpot";
import { tryLoad } from "@megawin/shared/utils";

import type { GetCurrentJackpotsInput, GetCurrentJackpotsOutput } from "./types";

const SCOPE = "GetCurrentJackpots";

export class GetCurrentJackpotsUseCase extends UseCase<GetCurrentJackpotsInput, GetCurrentJackpotsOutput> {
  private readonly mega645Uc = new Mega645JackpotUseCase();
  private readonly lotto535Uc = new Lotto535JackpotUseCase();
  private readonly power655Uc = new Power655JackpotUseCase();

  protected async execute(input: GetCurrentJackpotsInput): Promise<GetCurrentJackpotsOutput> {
    const games = input.games;
    const wantsMega645 = games === undefined || games.includes(JackpotGameProduct.Mega645);
    const wantsLotto535 = games === undefined || games.includes(JackpotGameProduct.Lotto535);
    const wantsPower655 = games === undefined || games.includes(JackpotGameProduct.Power655);

    // tryLoad không bao giờ reject → dùng Promise.all thuần. NOT_FOUND (đang giữa 2 cycle) →
    // undefined, im lặng (đúng nghiệp vụ). Lỗi bất thường (DB down, bug) → tự log kèm `source`.
    const [mega645, lotto535, power655] = await Promise.all([
      wantsMega645
        ? tryLoad(() => this.mega645Uc.run(), { scope: SCOPE, source: JackpotGameProduct.Mega645 })
        : Promise.resolve(undefined),
      wantsLotto535
        ? tryLoad(() => this.lotto535Uc.run(), { scope: SCOPE, source: JackpotGameProduct.Lotto535 })
        : Promise.resolve(undefined),
      wantsPower655
        ? tryLoad(() => this.power655Uc.run(), { scope: SCOPE, source: JackpotGameProduct.Power655 })
        : Promise.resolve(undefined),
    ]);

    return { mega645, lotto535, power655 };
  }
}
