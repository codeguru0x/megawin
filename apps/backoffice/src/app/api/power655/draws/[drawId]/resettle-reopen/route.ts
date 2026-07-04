import { withApi } from "@/lib/api";
import { actorFromSession } from "@/lib/audit-actor";
import { CompanyRole } from "@megawin/identity/entities";
import { ReopenForCascadeUseCase } from "@megawin/game-power655-application/use-cases/draws";

import { reopenForCascadeSchema } from "../../_lib/schema";

const reopenForCascadeUseCase = new ReopenForCascadeUseCase();

/**
 * POST /api/power655/draws/[drawId]/resettle-reopen
 *
 * Mở cổng resettle cho kỳ T+n trong cascade TYPE_B2 khi KẾT QUẢ SỐ KHÔNG ĐỔI.
 *
 * Cascade B2 sửa kết quả kỳ T kéo theo các kỳ đã settle sau (T+1…T+n) phải
 * re-settle vì pool dual jackpot (JP1 + JP2) đổi — nhưng số quay của chúng không
 * đổi. Luồng publish-result thông thường return sớm khi result không đổi nên
 * không mở được `Settled → Published`. Endpoint này re-stamp `result.publishedAt`
 * (GIỮ nguyên winningMain + bonusNumber) để vượt cổng `DRAW_NO_NEW_RESULT`, sau
 * đó staff bấm "Kết sổ lại".
 *
 * Yêu cầu:
 *   - Kỳ ở status `settled`, đã từng kết sổ (`settledAt` != null), có result.
 *   - body `dbaConfirmed: true` (cascade cần Quản trị hệ thống chốt cycle).
 *
 * KHÔNG tự kiểm tra "có cascade đang chạy": cascade B2 do DBA giám sát thủ công —
 * DBA chỉ định danh sách kỳ (từ preflight `chainDrawIds`) và yêu cầu staff kết sổ
 * lại tuần tự. Thứ tự được TriggerResettle ép qua guard `RESETTLE_CASCADE_ORDER`.
 *
 * Trả về error nếu:
 *   - `DRAW_NEVER_SETTLED`: kỳ chưa từng settle.
 *   - `DRAW_INVALID_TRANSITION`: kỳ không ở status `settled`.
 *   - `RESETTLE_REQUIRES_DBA`: thiếu `dbaConfirmed`.
 */
export const POST = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .body(reopenForCascadeSchema)
  .handler(async ({ params, body, session, request }) => {
    const { drawId } = params as { drawId: string };
    return reopenForCascadeUseCase.run({
      drawId,
      dbaConfirmed: body.dbaConfirmed,
      actor: actorFromSession(session!, request),
    });
  });
