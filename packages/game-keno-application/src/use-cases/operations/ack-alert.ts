import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { OpsAlertRepository } from "../../infras/repos/ops-alert-repo";
import type { AckAlertInput, AckAlertOutput } from "./dto/alerts.dto";

/**
 * Acknowledge 1 alert — staff xác nhận đã xem/xử lý (analysis §3.5).
 *
 * `updateOne` `$set status:"ack", ackBy, ackAt`. Alert không tồn tại → notFound.
 */
export class AckAlertUseCase extends NextApiUseCase<AckAlertInput, AckAlertOutput> {
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
