import { NextApiUseCase } from "@megawin/next/server";
import { OpsAlertSeverity } from "@megawin/game-max3dpro/entities";
import type { Max3dproOpsAlertEntity, Max3dproOpsAlertType } from "@megawin/game-max3dpro/entities";
import { OpsAlertRepository } from "../../infras/repos/ops-alert-repo";
import type { AlertGroup, ListAlertsInput, ListAlertsOutput } from "./dto/alerts.dto";

/** Rank severity để chọn cao nhất trong nhóm (critical > warning > info). */
const SEVERITY_RANK: Record<string, number> = {
  [OpsAlertSeverity.Info]: 0,
  [OpsAlertSeverity.Warning]: 1,
  [OpsAlertSeverity.Critical]: 2,
};

/**
 * List alert 1 kỳ cho backoffice panel (on-demand, chỉ khi mở panel).
 *
 * Mặc định gộp theo `type` cho gọn; `grouped=false` trả raw để staff drill-down.
 * Trả CẢ item `ack` (không lọc mặc định) — UI v6: item ack render dưới disclosure
 * per-group, KHÔNG ẩn (guideline §4, giữ audit trail).
 */
export class ListAlertsUseCase extends NextApiUseCase<ListAlertsInput, ListAlertsOutput> {
  private readonly alertRepo = new OpsAlertRepository();

  protected async execute(input: ListAlertsInput): Promise<ListAlertsOutput> {
    const { drawId, status, grouped = true } = input;

    const items = await this.alertRepo.listByDrawAndStatus(drawId, status);

    if (!grouped) {
      return { drawId, grouped: false, items };
    }

    return { drawId, grouped: true, groups: this.groupByType(items) };
  }

  /** Gộp alert theo `type`, giữ severity cao nhất mỗi nhóm; nhóm sort theo severity giảm. */
  private groupByType(items: Max3dproOpsAlertEntity[]): AlertGroup[] {
    const byType = new Map<Max3dproOpsAlertType, AlertGroup>();

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
