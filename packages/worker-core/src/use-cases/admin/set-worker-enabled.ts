import { AUDIT_ACTIONS, AuditCategory, AuditTargetType } from "@megawin/audit/entities";
import { type AuditActor, record } from "@megawin/audit/logger";
import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";

import { WorkerLockRepository } from "../../infras/repos";

export interface SetWorkerEnabledInput {
  lockKey: string;
  isEnabled: boolean;
  /** Chủ thể thực hiện (Admin) — bắt buộc để ghi audit log ai đã toggle. */
  actor: AuditActor;
}

export interface SetWorkerEnabledOutput {
  lockKey: string;
  isEnabled: boolean;
}

/**
 * BO use case — bật/tắt kill-switch của 1 worker từ trang "Sức khoẻ worker".
 *
 * Tắt worker = dừng cập nhật toàn bộ ops liên quan cho đến khi bật lại — đây là
 * tác động vận hành THẬT (không phải cosmetic), nên PHẢI ghi audit log ai tắt
 * worker nào, lúc nào (nếu không, sau này không truy được vì sao stats ngừng
 * chạy). Fire-and-forget: audit fail không chặn mutation.
 */
export class SetWorkerEnabledUseCase extends NextApiUseCase<SetWorkerEnabledInput, SetWorkerEnabledOutput> {
  private readonly repo = new WorkerLockRepository();

  protected async execute(input: SetWorkerEnabledInput): Promise<SetWorkerEnabledOutput> {
    const updated = await this.repo.setEnabled(input.lockKey, input.isEnabled);

    if (!updated) {
      throw AppException.notFound(`Worker "${input.lockKey}" chưa từng ghi nhận — không thể bật/tắt.`);
    }

    record({
      actorId: input.actor.id,
      actorType: input.actor.type,
      actorName: input.actor.name,
      actorRoles: input.actor.roles,
      tenantId: input.actor.tenantId,
      ip: input.actor.ip,
      action: AUDIT_ACTIONS.worker.setEnabled,
      category: AuditCategory.Worker,
      targetType: AuditTargetType.Worker,
      targetId: updated.lockKey,
      targetLabel: updated.description ?? updated.lockKey,
      changes: { before: { isEnabled: !input.isEnabled }, after: { isEnabled: input.isEnabled } },
    });

    return { lockKey: updated.lockKey, isEnabled: updated.isEnabled };
  }
}
