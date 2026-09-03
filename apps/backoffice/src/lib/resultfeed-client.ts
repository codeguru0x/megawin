/**
 * ResultFeed Client — factory theo `env.RESULTFEED_CLIENT_MODE`.
 *
 * Mọi nơi khác (7 `GetVietlottResultUseCase`) chỉ import `resultFeedClient` từ file này,
 * không biết đang chạy mode nào — đổi `RESULTFEED_CLIENT_MODE` không cần sửa gì ở
 * `game-*-application`.
 */

import type { VietlottResultClient } from "@megawin/game-core/types";

import { env } from "@/env";
import { resultFeedClientDirect } from "@/lib/resultfeed-client-direct";
import { resultFeedClientHttp } from "@/lib/resultfeed-client-http";

export const resultFeedClient: VietlottResultClient =
  env.RESULTFEED_CLIENT_MODE === "http" ? resultFeedClientHttp : resultFeedClientDirect;
