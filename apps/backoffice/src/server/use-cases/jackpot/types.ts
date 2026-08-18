/**
 * Get Current Jackpots — types cho facade RAW gộp 3 game có jackpot cycle.
 *
 * Đây là RAW DTO của từng game (nguyên shape `GetJackpotCurrentUseCase` trả về, KHÔNG map) —
 * mỗi consumer trong backoffice (dashboard card, tool AI `getGameJackpot`) tự map sang shape
 * riêng của mình. Xem rationale gộp orchestration tại `get-current-jackpots.ts`.
 */

import type { JackpotGameProduct } from "@megawin/game-core/entities";
import type { GetJackpotCurrentOutput as Lotto535JackpotOutput } from "@megawin/game-lotto535-application/use-cases/jackpot";
import type { GetJackpotCurrentOutput as Mega645JackpotOutput } from "@megawin/game-mega645-application/use-cases/jackpot";
import type { GetJackpotCurrentOutput as Power655JackpotOutput } from "@megawin/game-power655-application/use-cases/jackpot";

export type { Lotto535JackpotOutput, Mega645JackpotOutput, Power655JackpotOutput };

/** Không truyền `games` → lấy cả 3 game có jackpot cycle. */
export interface GetCurrentJackpotsInput {
  games?: readonly JackpotGameProduct[];
}

/**
 * RAW output — field `undefined` khi game không được yêu cầu (`games` lọc bỏ), KHÔNG có
 * active cycle (giữa 2 chu kỳ), hoặc lỗi bất thường (đã log qua `tryLoad`, xem
 * `get-current-jackpots.ts`).
 */
export interface GetCurrentJackpotsOutput {
  mega645?: Mega645JackpotOutput;
  lotto535?: Lotto535JackpotOutput;
  power655?: Power655JackpotOutput;
}
