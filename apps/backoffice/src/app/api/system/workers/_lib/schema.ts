import { z } from "zod";

/**
 * Body cho PATCH `/api/system/workers/enabled` — toggle kill-switch.
 *
 * `lockKey` truyền qua BODY (không dynamic segment `[lockKey]`) vì chứa dấu `:`
 * (`"keno:stats-sync"`) — nhét vào path buộc encode/decode 2 đầu.
 */
export const setWorkerEnabledSchema = z.object({
  lockKey: z.string().min(1),
  isEnabled: z.boolean(),
});
