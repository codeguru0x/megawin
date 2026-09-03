/**
 * Lambda: consensus-tick (ResultFeed)
 *
 * EventBridge gọi mỗi 1 phút — đọc observation mới đổi, tổng hợp quyết định consensus cho
 * mọi game (Keno, Bingo18, …) trong 1 lock duy nhất (xem `ConsensusTickUseCase` JSDoc).
 *
 * `ttlSeconds` set trong `ConsensusTickUseCase` (60s) PHẢI khớp `timeout: 60` khai báo ở
 * `functions/consensus.yml` — công thức chuẩn: TTL = Lambda timeout (xem
 * `SingleRunWorker.ttlSeconds` JSDoc).
 *
 * `RESULTFEED_AUTO_PUBLISH_UNVERIFIED` đọc TẠI ĐÂY (tầng handler), KHÔNG đọc `process.env`
 * trong use-case — giữ use-case testable, không phụ thuộc runtime env (03-consensus.plan.md
 * §6.1). Đọc lại MỖI invocation (KHÔNG cache module-scope) để đổi env trên Lambda console/SSM
 * có hiệu lực ngay lần invoke kế tiếp, không cần chờ cold start.
 */

import { ConsensusTickUseCase } from "@megawin/resultfeed-application/use-cases/consensus";

export async function handler() {
  const useCase = new ConsensusTickUseCase({
    autoPublishUnverified: process.env.RESULTFEED_AUTO_PUBLISH_UNVERIFIED === "true",
  });
  return useCase.run();
}
