/**
 * Power 6/55 – List Alerts Use Case
 *
 * List alert 1 kỳ cho backoffice panel (on-demand, chỉ khi mở panel — analysis §4.1
 * mirror Keno). Mặc định gộp theo `type` cho gọn; `grouped=false` trả raw để staff
 * drill-down điều tra.
 */

import { UseCase } from "@megawin/app-core/use-cases";
import type { Power655OpsAlertEntity, Power655OpsAlertType } from "@megawin/game-power655/entities";
import { OpsAlertSeverity } from "@megawin/game-power655/entities";

import { OpsAlertRepository } from "../../infras/repos/ops-alert-repo";
import type { ListAlertsInput, ListAlertsOutput, Power655AlertGroup } from "./dto/ops.dto";

/** Rank severity để chọn cao nhất trong nhóm (critical > warning > info). */
const SEVERITY_RANK: Record<string, number> = {
  [OpsAlertSeverity.Info]: 0,
  [OpsAlertSeverity.Warning]: 1,
  [OpsAlertSeverity.Critical]: 2,
};

export class ListAlertsUseCase extends UseCase<ListAlertsInput, ListAlertsOutput> {
  private readonly alertRepo = new OpsAlertRepository();

  protected async execute(input: ListAlertsInput): Promise<ListAlertsOutput> {
    const { drawId, status, grouped = true } = input;

    const items = await this.alertRepo.listByFilter(drawId, status);

    if (!grouped) {
      return { drawId, grouped: false, items };
    }

    return { drawId, grouped: true, groups: this.groupByType(items) };
  }

  /** Gộp alert theo `type`, giữ severity cao nhất mỗi nhóm; nhóm sort theo severity giảm. */
  private groupByType(items: Power655OpsAlertEntity[]): Power655AlertGroup[] {
    const byType = new Map<Power655OpsAlertType, Power655AlertGroup>();

    for (const item of items) {
      const existing = byType.get(item.type);
      if (existing) {
        existing.count += 1;
        existing.items.push(item);
        // Nâng severity nhóm nếu item hiện tại nghiêm trọng hơn.
        if (SEVERITY_RANK[item.severity]! > SEVERITY_RANK[existing.severity]!) {
          existing.severity = item.severity;
        }
      } else {
        byType.set(item.type, {
          type: item.type,
          count: 1,
          severity: item.severity,
          items: [item],
        });
      }
    }

    return [...byType.values()].sort((a, b) => SEVERITY_RANK[b.severity]! - SEVERITY_RANK[a.severity]!);
  }
}
