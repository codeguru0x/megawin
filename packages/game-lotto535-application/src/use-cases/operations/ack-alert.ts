/**
 * Lotto 5/35 – Ack Alert Use Case
 *
 * Acknowledge 1 alert — staff xác nhận đã xem/xử lý (analysis §3.7, mirror Power
 * 6/55). `updateOne` `$set status:"ack", ackBy, ackAt` với filter `status: New` —
 * race 2 staff ack cùng lúc: người sau filter không khớp (đã đổi) → no-op êm (R9).
 */

import { UseCase } from "@megawin/app-core/use-cases";
import { AppException } from "@megawin/shared/errors";

import { OpsAlertRepository } from "../../infras/repos/ops-alert-repo";
import type { AckAlertInput, AckAlertOutput } from "./dto/ops.dto";

export class AckAlertUseCase extends UseCase<AckAlertInput, AckAlertOutput> {
  private readonly alertRepo = new OpsAlertRepository();

  protected async execute(input: AckAlertInput): Promise<AckAlertOutput> {
    const { alertId, actorId } = input;

    const acked = await this.alertRepo.ackById(alertId, actorId);
    if (!acked) {
      throw AppException.notFound(`Alert ${alertId} không tồn tại.`);
    }

    return { acked: true };
  }
}
