/**
 * Lambda: recover-tx-intents
 *
 * Scan orphan tx_intents (WAL) và xử lý recovery.
 * EventBridge gọi mỗi 2 phút.
 *
 * ## FLOW:
 *
 * 1. Query orphan DEBIT_PENDING > 30s, < 20 attempts.
 * 2. Confirm debit status tại tenant (read-only, không side effect).
 *    - not_found/failed → xoá WAL (debit chưa xảy ra).
 *    - success → check ticket exists → markCompleted hoặc rollback credit.
 *    - timeout → retry lần sau.
 * 3. Exhausted (>= 20 attempts) → MANUAL_REVIEW + alert.
 *
 * ## TICKET EXISTENCE CHECK:
 *
 * Handler inject map gameId → TicketLookupService vào RecoverOrphanTxIntentsUseCase.
 * Mỗi game có service riêng, wrap game-specific TicketRepository.existsByTx().
 * Nếu gameId không có checker → fallback false → rollback credit.
 *
 * ## CONCURRENCY SAFE:
 *
 * Không cần distributed lock. Mỗi intent xử lý atomic bằng MongoDB phase guard.
 * 2 Lambda cùng lúc handle 1 intent → chỉ 1 cái thành công.
 */

import { Bingo18TicketLookupService } from "@megawin/game-bingo18-application/services";
import { RecoverOrphanTxIntentsUseCase } from "@megawin/game-core-application/use-cases";
import { KenoTicketLookupService } from "@megawin/game-keno-application/services";
import { Lotto535TicketLookupService } from "@megawin/game-lotto535-application/services";
import { Max3dTicketLookupService } from "@megawin/game-max3d-application/services";
import { Max3dproTicketLookupService } from "@megawin/game-max3dpro-application/services";
import { Mega645TicketLookupService } from "@megawin/game-mega645-application/services";
import { Power655TicketLookupService } from "@megawin/game-power655-application/services";

// ── Khởi tạo lookup services — 1 lần, reuse giữa các invocations ──
// Lambda reuse container giữa các lần gọi → singleton pattern phù hợp.
const kenoLookup = new KenoTicketLookupService();
const lotto535Lookup = new Lotto535TicketLookupService();
const mega645Lookup = new Mega645TicketLookupService();
const power655Lookup = new Power655TicketLookupService();
const max3dLookup = new Max3dTicketLookupService();
const max3dproLookup = new Max3dproTicketLookupService();
const bingo18Lookup = new Bingo18TicketLookupService();

/**
 * Map gameId → TicketLookupService.existsByTx().
 *
 * Khi thêm game mới:
 * 1. Tạo TicketLookupService trong game-{game}-application/src/services/
 * 2. Thêm dependency vào worker-game-core/package.json
 * 3. Import + khởi tạo instance ở trên
 * 4. Thêm entry vào map dưới
 */
const ticketCheckers: Record<string, (tx: string) => Promise<boolean>> = {
  keno: (tx) => kenoLookup.existsByTx(tx),
  lotto535: (tx) => lotto535Lookup.existsByTx(tx),
  mega645: (tx) => mega645Lookup.existsByTx(tx),
  power655: (tx) => power655Lookup.existsByTx(tx),
  max3d: (tx) => max3dLookup.existsByTx(tx),
  max3dpro: (tx) => max3dproLookup.existsByTx(tx),
  bingo18: (tx) => bingo18Lookup.existsByTx(tx),
};

/**
 * Callback inject vào RecoverOrphanTxIntentsUseCase.
 * Dispatch theo gameId — nếu game không có checker thì fallback false (→ rollback).
 */
const ticketExistsFn = async (gameId: string, tx: string): Promise<boolean> => {
  const checker = ticketCheckers[gameId];
  if (!checker) {
    console.warn(
      `[recover-tx-intents] No ticket checker for gameId="${gameId}". Falling back to false → will rollback.`,
    );
    return false;
  }
  return checker(tx);
};

const useCase = new RecoverOrphanTxIntentsUseCase(ticketExistsFn);

export async function handler() {
  return useCase.run();
}
