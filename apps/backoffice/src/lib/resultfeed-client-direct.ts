/**
 * ResultFeed Client — mode "direct".
 *
 * Gọi thẳng `PullResultsUseCase` (`@megawin/resultfeed-application`) trong tiến trình —
 * KHÔNG qua HTTP. Nhanh, dùng khi backoffice cùng `MONGODB_URI`/cluster với ResultFeed.
 * Backoffice được phép import `resultfeed-application` trực tiếp (không nằm trong nhóm
 * "core" bị chặn ở domain boundary D7 — chỉ chặn `packages/game-*`/`apps/api-*`/`apps/worker-*`).
 *
 * Implementation của `VietlottResultClient` (`@megawin/game-core/types`) — mặc định
 * (`RESULTFEED_CLIENT_MODE="direct"`), xem factory `resultfeed-client.ts`.
 */

import type { VietlottResultClient, VietlottResultRecord } from "@megawin/game-core/types";
import type { ResultFeedGameKey } from "@megawin/resultfeed/entities";
import { PullResultsUseCase } from "@megawin/resultfeed-application/use-cases/results";

const pullResultsUseCase = new PullResultsUseCase();

export const resultFeedClientDirect: VietlottResultClient = {
  async getResult(lookup): Promise<VietlottResultRecord | null> {
    const { items } = await pullResultsUseCase.run({
      // `gameKey` ở interface chung là string thuần (giữ D7) — caller (7 GetVietlottResultUseCase)
      // luôn truyền literal khớp `ResultFeedGameKey`, nên cast an toàn ở đây.
      gameKey: lookup.gameKey as ResultFeedGameKey,
      drawPeriod: lookup.drawPeriod,
    });

    const item = items[0];
    if (!item) {
      return null;
    }

    return {
      numbers: item.numbers,
      drawDateSource: item.drawDateSource,
      publishedAt: item.publishedAt,
      verifiedByHuman: item.verifiedByHuman,
      sourceCount: item.sourceCount,
    };
  },
};
