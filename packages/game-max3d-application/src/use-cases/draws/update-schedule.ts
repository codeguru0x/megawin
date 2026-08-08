/**
 * Use Case: Update Draw Schedule (Max 3D)
 *
 * Sửa giờ mở/đóng bán cho 1 kỳ quay.
 *
 * Quy tắc:
 *   - Chỉ cho phép khi draw ở trạng thái scheduled hoặc salesOpen.
 *   - openAt < closeAt < drawTime (bắt buộc).
 */

import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { DrawStatus } from "@megawin/game-core/entities";
import type { AuditActor } from "@megawin/audit/logger";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { auditUpdateSchedule } from "../../services/audit-log";

export interface UpdateScheduleInput {
  drawId: string;
  /** ISO string – thời điểm mở bán mới. */
  salesOpenAt: string;
  /** ISO string – thời điểm đóng bán mới. */
  salesCloseAt: string;
  /** ISO string – giờ quay số mới (tùy chọn, hiếm khi thay đổi). */
  drawTime?: string;
  /** Chủ thể thực hiện (staff BO) — dùng cho audit. Optional cho caller nội bộ. */
  actor?: AuditActor;
}

export interface UpdateScheduleOutput {
  drawId: string;
  sales: { openAt: string; closeAt: string };
  drawTime: string;
}

const EDITABLE_STATUSES = new Set<string>([DrawStatus.Scheduled, DrawStatus.SalesOpen]);

export class UpdateScheduleUseCase extends NextApiUseCase<UpdateScheduleInput, UpdateScheduleOutput> {
  private readonly drawRepo = new DrawRepository();

  protected async execute(input: UpdateScheduleInput): Promise<UpdateScheduleOutput> {
    const draw = await this.drawRepo.getDrawById(input.drawId);
    if (!draw) {
      throw AppException.notFound(`Kỳ quay ${input.drawId} không tồn tại.`);
    }

    if (!EDITABLE_STATUSES.has(draw.status)) {
      throw new AppException(
        "DRAW_INVALID_TRANSITION",
        `Không thể sửa lịch – draw ở trạng thái "${draw.status}". Chỉ sửa khi "scheduled" hoặc "salesOpen".`,
      );
    }

    const openAt = new Date(input.salesOpenAt);
    const closeAt = new Date(input.salesCloseAt);
    const newDrawTime = input.drawTime ? new Date(input.drawTime) : null;
    const drawTime = newDrawTime ?? draw.drawTime;

    if (isNaN(openAt.getTime()) || isNaN(closeAt.getTime())) {
      throw AppException.badRequest("Thời gian mở/đóng bán không hợp lệ.");
    }

    if (newDrawTime && isNaN(newDrawTime.getTime())) {
      throw AppException.badRequest("Giờ quay số không hợp lệ.");
    }

    if (closeAt <= openAt) {
      throw AppException.badRequest("Giờ đóng bán phải lớn hơn giờ mở bán.");
    }

    if (closeAt >= drawTime) {
      throw AppException.badRequest(`Giờ đóng bán phải nhỏ hơn giờ quay số (${drawTime.toISOString()}).`);
    }

    const updated = await this.drawRepo.updateSchedule(input.drawId, {
      openAt,
      closeAt,
      drawTime: newDrawTime ?? undefined,
    });

    if (!updated) {
      throw AppException.internal("Cập nhật lịch thất bại.");
    }

    // Audit staff đổi lịch — ghi diff lịch cũ/mới. Fire-and-forget.
    if (input.actor) {
      auditUpdateSchedule({
        actor: input.actor,
        drawId: input.drawId,
        before: {
          openAt: draw.sales.openAt?.toISOString(),
          closeAt: draw.sales.closeAt.toISOString(),
          drawTime: draw.drawTime.toISOString(),
        },
        after: {
          openAt: openAt.toISOString(),
          closeAt: closeAt.toISOString(),
          drawTime: drawTime.toISOString(),
        },
      });
    }

    return {
      drawId: input.drawId,
      sales: {
        openAt: openAt.toISOString(),
        closeAt: closeAt.toISOString(),
      },
      drawTime: drawTime.toISOString(),
    };
  }
}
