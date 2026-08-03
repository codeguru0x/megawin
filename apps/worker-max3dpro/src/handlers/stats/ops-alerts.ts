/**
 * Lambda: ops-alerts (Max 3D Pro)
 *
 * Đánh giá rule alert trên stats docs ĐÃ ĐỔI kể từ cursor — tách khỏi đường ghi `stats-sync`
 * (analysis §5.1): lỗi rule alert không làm chậm sync, backlog sync không làm trễ alert kỳ
 * khác.
 *
 * EventBridge gọi mỗi 1 phút; use case chạy intra-invocation loop có `sleep(tickSeconds)`
 * (~55s budget) để đạt nhịp cùng chu kỳ với `stats-sync`, rồi thoát cho invocation kế tiếp
 * takeover. Distributed lock `max3dpro:ops-alerts` (TTL 120s) đảm bảo 1 invocation chạy tại
 * 1 thời điểm — độc lập lock với `max3dpro:stats-sync`.
 */

import { EvaluateOpsAlertsUseCase } from "@megawin/game-max3dpro-application/use-cases/operations";

const useCase = new EvaluateOpsAlertsUseCase();

export async function handler() {
  return useCase.run();
}
