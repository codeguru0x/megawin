import { UseCase } from "@megawin/app-core/use-cases";

import type { WorkerLockEntity } from "../../entities";
import { WorkerLockKind } from "../../entities";
import { WorkerLockRepository } from "../../infras/repos";
import { type WorkerHealthRow, WorkerRunState } from "./types";

export type ListWorkersHealthOutput = WorkerHealthRow[];

/**
 * Derive {@link WorkerRunState} từ trạng thái lock — LUÔN ở SERVER (không phải FE)
 * để tránh lệch giờ đồng hồ client làm sai `crashed`.
 *
 * Thứ tự ưu tiên: `disabled` (kill-switch) > `crashed` > `running` > `idle` —
 * kill-switch che mọi trạng thái khác vì nó là tín hiệu ops cố ý, quan trọng hơn
 * trạng thái lock tức thời.
 */
function deriveState(doc: WorkerLockEntity, now: Date): WorkerRunState {
  if (!doc.isEnabled) {
    return WorkerRunState.Disabled;
  }
  if (doc.ownerToken != null) {
    return doc.expiresAt.getTime() <= now.getTime() ? WorkerRunState.Crashed : WorkerRunState.Running;
  }
  return WorkerRunState.Idle;
}

/** Số giây kể từ `lastSuccessAt` — `null` nếu worker chưa từng chạy thành công. */
function calcSecondsSinceSuccess(lastSuccessAt: string | null, now: Date): number | null {
  if (!lastSuccessAt) {
    return null;
  }
  return Math.max(0, Math.round((now.getTime() - new Date(lastSuccessAt).getTime()) / 1000));
}

/**
 * BO use case — liệt kê sức khoẻ mọi worker (`kind = Worker`) cho trang
 * "Sức khoẻ worker" (`/system/workers`).
 *
 * Đặt trong `worker-core` (không phải app) vì package này là chủ sở hữu tự nhiên
 * của `WorkerLockRepository` — tránh leak `ownerToken`/`expiresAt` (infra detail)
 * ra Backoffice (`mongodb.mdc` §4/§10).
 *
 * Trả `WorkerHealthRow[]` (KHÔNG trả `WorkerLockEntity[]`) — chỉ field FE dùng,
 * giảm serialization qua RSC boundary (`vercel-react-best-practices` §3.4) và
 * tránh lộ `ownerToken` ra client.
 */
export class ListWorkersHealthUseCase extends UseCase<void, ListWorkersHealthOutput> {
  private readonly repo = new WorkerLockRepository();

  protected async execute(): Promise<ListWorkersHealthOutput> {
    const docs = await this.repo.listByKind(WorkerLockKind.Worker);
    const now = new Date();

    return docs.map((doc) => ({
      lockKey: doc.lockKey,
      // Fallback ở use-case (KHÔNG ở mapper) — mapper giữ phân biệt "chưa khai"
      // vs "khai bằng lockKey" (xem worker-lock-mapper.ts).
      description: doc.description ?? doc.lockKey,
      state: deriveState(doc, now),
      lastSuccessAt: doc.lastSuccessAt,
      secondsSinceSuccess: calcSecondsSinceSuccess(doc.lastSuccessAt, now),
      lastError: doc.lastError,
      cursor: doc.cursor,
      isEnabled: doc.isEnabled,
      stalledItems: doc.stalledItems,
    }));
  }
}
