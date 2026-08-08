/**
 * Use Case: Reopen For Cascade (Mega 6/45) — mở cổng resettle cho kỳ T+n trong
 * cascade TYPE_B2 khi KẾT QUẢ SỐ KHÔNG ĐỔI.
 *
 * ── Vì sao cần use-case riêng ───────────────────────────────────────────────
 * Cascade TYPE_B2: sửa kết quả kỳ T (đầu chuỗi) kéo theo các kỳ ĐÃ settle sau nó
 * (T+1…T+n) phải re-settle vì pool jackpot tích luỹ + ranh giới cycle đổi. NHƯNG
 * số quay của T+1…T+n KHÔNG đổi — chỉ số tiền/cycle tính lại.
 *
 * Luồng publish-result thông thường (`PublishResultUseCase`) return sớm khi
 * `resultUnchanged` → KHÔNG chuyển `Settled → Published`, KHÔNG re-stamp
 * `result.publishedAt`. Hệ quả: `TriggerResettleUseCase` chặn các kỳ này tại cổng
 * `DRAW_NO_NEW_RESULT` (`result.publishedAt <= settledAt`). Cascade bị "deadlock":
 * guard `RESETTLE_CASCADE_ORDER` bắt buộc làm tuần tự T→T+1→…, nhưng không có cách
 * nào mở cổng cho T+n khi số không đổi.
 *
 * Use-case này là entry point riêng cho cascade: re-stamp `result.publishedAt =
 * now` (GIỮ NGUYÊN winningNumbers), chuyển `Settled → Published`, $unset data settle
 * cũ → mở cổng để staff bấm "Kết sổ lại" cho kỳ T+n như bình thường.
 *
 * ── Guard (chặt, an toàn) ───────────────────────────────────────────────────
 *   1. Draw tồn tại + có result + đã từng settle (`settledAt != null`).
 *   2. Status PHẢI là `Settled` (kỳ đã đóng sổ, chưa mở lại). Mọi status khác reject.
 *   3. `dbaConfirmed === true` — reopen chỉ phục vụ cascade cần Quản trị hệ thống
 *      can thiệp cycle thủ công. Thiếu → reject `RESETTLE_REQUIRES_DBA`.
 *
 * ── Vì sao KHÔNG tự kiểm tra "có cascade đang chạy" ──────────────────────────
 * Cascade B2 là quy trình THỦ CÔNG do DBA giám sát từ đầu tới cuối (đó là lý do
 * bắt buộc `dbaConfirmed`). DBA đọc `chainDrawIds` từ bước preflight, rồi CHỈ ĐỊNH
 * staff kết sổ lại tuần tự T→T+1→…→T+n. Việc "kỳ này có thuộc cascade không" do DBA
 * quyết định theo runbook, KHÔNG suy luận tự động.
 *
 * Bản version trước thử dùng `findPendingResettleBeforeDraw` (tìm kỳ TRƯỚC đang dở
 * `Published/Settling`) làm bằng chứng cascade — SAI: cascade chạy tuần tự nên ngay
 * khi kỳ T+n-1 resettle xong nó về `Settled`, query trả null → reject oan T+n. Cửa
 * sổ hợp lệ chỉ vài giây lúc kỳ trước đang `Settling` → bất khả thi vận hành. Suy
 * luận từ số tiền (lệch opening) cũng không robust vì giá trị biến động qua các bước
 * DBA chốt cycle. Do đó BỎ guard tự động; an toàn dựa trên 2 lớp:
 *   - `dbaConfirmed` — chỉ DBA mới mở được.
 *   - `RESETTLE_CASCADE_ORDER` (ở TriggerResettle.assertNoPendingPriorDraw) — ép
 *     thứ tự tuần tự khi staff bấm "Kết sổ lại", chặn nhảy cóc kỳ.
 *
 * Sau khi reopen, kỳ ở `Published` với `publishedAt > settledAt` → staff bấm
 * "Kết sổ lại" (TriggerResettle) sẽ vào luồng B2 bình thường. `winningNumbers`
 * không đổi nên `detectBoundaries` re-match cho ra winner state giống cũ; số tiền
 * tính lại theo opening mới (closing kỳ trước vừa resettle).
 *
 * IDEMPOTENT: `reopenForResettle` filter `status = Settled` → gọi lại trên kỳ đã
 * Published là no-op (trả null), use-case nhận diện và trả về trạng thái hiện tại.
 */

import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { DrawStatus } from "@megawin/game-core/entities";
import { nowVN } from "@megawin/shared/utils";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { auditReopenForCascade } from "../../services/audit-log";
import type { ReopenForCascadeInput, ReopenForCascadeOutput } from "./dto/draw.dto";

export class ReopenForCascadeUseCase extends NextApiUseCase<ReopenForCascadeInput, ReopenForCascadeOutput> {
  private readonly drawRepo = new DrawRepository();

  /** @inheritdoc */
  protected async execute(input: ReopenForCascadeInput): Promise<ReopenForCascadeOutput> {
    const { drawId } = input;

    // ── Guard 1: draw tồn tại + có result + đã từng settle ───────────────
    const draw = await this.drawRepo.getDrawById(drawId);
    if (!draw) {
      throw AppException.notFound(`Kỳ quay ${drawId} không tồn tại.`);
    }

    if (!draw.result) {
      throw AppException.badRequest(`Kỳ quay ${drawId} chưa có kết quả — không thể mở lại.`);
    }

    if (!draw.settledAt) {
      throw new AppException(
        "DRAW_NEVER_SETTLED",
        `Kỳ quay ${drawId} chưa từng kết sổ — không thuộc cascade resettle.`,
      );
    }

    // ── Guard 3: BẮT BUỘC Quản trị hệ thống xác nhận ─────────────────────
    // Reopen mở cổng resettle khi số không đổi → chỉ hợp lệ trong cascade B2 cần
    // can thiệp cycle thủ công. Không cho phép tự động.
    if (!input.dbaConfirmed) {
      throw new AppException(
        "RESETTLE_REQUIRES_DBA",
        `Mở lại kỳ ${drawId} để cascade resettle yêu cầu xác nhận của Quản trị hệ thống.`,
      );
    }

    // ── Guard 2: status PHẢI là Settled ──────────────────────────────────
    // Idempotent: nếu đã ở Published (đã reopen, publishedAt > settledAt) → no-op,
    // trả trạng thái hiện tại để staff tiếp tục bấm "Kết sổ lại".
    if (draw.status === DrawStatus.Published) {
      const publishedAt = draw.result.publishedAt ?? draw.settledAt;
      if (publishedAt.getTime() > draw.settledAt.getTime()) {
        return {
          drawId,
          status: DrawStatus.Published,
          result: {
            winningNumbers: [...draw.result.winningNumbers],
            publishedAt: publishedAt.toISOString(),
          },
        };
      }
    }

    if (draw.status !== DrawStatus.Settled) {
      throw new AppException(
        "DRAW_INVALID_TRANSITION",
        `Không thể mở lại kỳ ${drawId} — draw đang ở "${draw.status}", chỉ kỳ đã "settled" mới mở được.`,
      );
    }

    // ── Mở cổng: re-stamp publishedAt, GIỮ winningNumbers, settled → published ─
    // KHÔNG kiểm tra "có cascade đang chạy" ở đây (xem JSDoc class): cascade B2 do
    // DBA giám sát thủ công, thứ tự tuần tự được TriggerResettle ép qua guard
    // RESETTLE_CASCADE_ORDER. dbaConfirmed (Guard 3) đã đảm bảo chỉ DBA mở được.
    const publishedAt = nowVN();
    const updated = await this.drawRepo.reopenForResettle(drawId, publishedAt);

    if (!updated) {
      // Mất race: kỳ vừa rời khỏi Settled (kỳ khác mở trước / status đổi).
      throw new AppException(
        "DRAW_INVALID_TRANSITION",
        `Mở lại kỳ ${drawId} thất bại — draw không còn ở "settled". Vui lòng tải lại.`,
      );
    }

    // Audit staff mở lại kỳ đã settled cho cascade jackpot (settled → published).
    // Chỉ ghi ở lần reopen thật (nhánh idempotent no-op ở trên đã return sớm).
    // Fire-and-forget.
    if (input.actor) {
      auditReopenForCascade({
        actor: input.actor,
        drawId,
        prevStatus: DrawStatus.Settled,
      });
    }

    return {
      drawId,
      status: DrawStatus.Published,
      result: {
        // GIỮ NGUYÊN số quay — chỉ publishedAt thay đổi.
        winningNumbers: [...draw.result.winningNumbers],
        publishedAt: publishedAt.toISOString(),
      },
    };
  }
}
