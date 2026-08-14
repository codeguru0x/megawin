import { UseCase } from "@megawin/app-core/use-cases";
import { AppException } from "@megawin/shared/errors";

import { OpsAlertRepository } from "../../infras/repos/ops-alert-repo";
import type { AckAlertInput, AckAlertOutput } from "./dto/alerts.dto";

/**
 * Acknowledge 1 alert — staff xác nhận đã xem/xử lý.
 *
 * `updateOne` `$set status:"ack", ackBy, ackAt`. Alert không tồn tại → notFound.
 * KHÔNG xoá doc, KHÔNG chặn worker cập nhật payload sau ack (UI v6 — ack ≠ hết rủi ro,
 * giữ audit trail).
 */
export class AckAlertUseCase extends UseCase<AckAlertInput, AckAlertOutput> {
  private readonly alertRepo = new OpsAlertRepository();

  protected async execute(input: AckAlertInput): Promise<AckAlertOutput> {
    const { alertId, actorId } = input;

    const acked = await this.alertRepo.ack(alertId, actorId);
    if (!acked) {
      throw AppException.notFound(`Alert ${alertId} không tồn tại.`);
    }

    return { acked: true };
  }
}
