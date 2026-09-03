/**
 * ResultFeed – UpdateSourceUseCase
 *
 * `07-admin-management-page.plan.md §3.2`. Wrap `SourceRepository.upsertBySourceId()` —
 * theo đúng ghi chú JSDoc của repo (`upsertBySourceId`): đổi `role`/`trustWeight`/`isEnabled`
 * qua backoffice là quyết định VẬN HÀNH, nên use-case này PHẢI tự ghi audit log, repo không
 * tự làm.
 */

import { AUDIT_ACTIONS, AuditCategory, AuditTargetType } from "@megawin/audit/entities";
import type { AuditActor } from "@megawin/audit/logger";
import { record } from "@megawin/audit/logger";
import type { ResultFeedSourceId } from "@megawin/resultfeed/entities";
import { AppException } from "@megawin/shared/errors";

import type { SourceEditableFields } from "../../infras/repos/source-repo";
import { SourceRepository } from "../../infras/repos/source-repo";

export interface UpdateSourceInput {
  sourceId: ResultFeedSourceId;
  fields: SourceEditableFields;
  actor: AuditActor;
}

export class UpdateSourceUseCase {
  private readonly sourceRepo = new SourceRepository();

  async run(input: UpdateSourceInput): Promise<{ sourceId: ResultFeedSourceId }> {
    const before = await this.sourceRepo.findBySourceId(input.sourceId);
    if (!before) {
      throw AppException.notFound(`Không tìm thấy nguồn sourceId=${input.sourceId}.`);
    }

    const ok = await this.sourceRepo.upsertBySourceId(input.sourceId, input.fields);
    if (!ok) {
      throw AppException.internal(`Cập nhật nguồn sourceId=${input.sourceId} thất bại.`);
    }

    record({
      actorId: input.actor.id,
      actorType: input.actor.type,
      actorName: input.actor.name,
      actorRoles: input.actor.roles,
      tenantId: input.actor.tenantId,
      ip: input.actor.ip,
      action: AUDIT_ACTIONS.resultfeed.updateSource,
      category: AuditCategory.ResultFeed,
      targetType: AuditTargetType.ResultFeedSource,
      targetId: input.sourceId,
      targetLabel: `Nguồn ResultFeed ${before.name}`,
      changes: {
        before: { role: before.role, trustWeight: before.trustWeight, isEnabled: before.isEnabled },
        after: {
          role: input.fields.role,
          trustWeight: input.fields.trustWeight,
          isEnabled: input.fields.isEnabled,
        },
      },
    });

    return { sourceId: input.sourceId };
  }
}
