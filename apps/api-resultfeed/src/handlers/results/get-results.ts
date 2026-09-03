/**
 * ResultFeed Public API — `GET /results`.
 *
 * Hỗ trợ 2 mode query (xem `PullResultsUseCase`):
 * - `gameKey` + `drawPeriod` → single lookup, tối đa 1 item.
 * - `gameKey` + `since?` + `size?` → batch, mới nhất trước.
 */

import { ResultFeedGameKey } from "@megawin/resultfeed/entities";
import { PullResultsUseCase } from "@megawin/resultfeed-application/use-cases/results";
import { z } from "zod";

import { withResultFeedApiKeyAuth } from "../../lib/build-handler";

const querySchema = z.object({
  gameKey: z.enum([
    ResultFeedGameKey.Keno,
    ResultFeedGameKey.Bingo18,
    ResultFeedGameKey.Lotto535,
    ResultFeedGameKey.Mega645,
    ResultFeedGameKey.Power655,
    ResultFeedGameKey.Max3d,
    ResultFeedGameKey.Max3dpro,
  ]),
  drawPeriod: z.string().min(1).optional(),
  since: z.string().optional(),
  size: z.coerce.number().int().positive().max(200).optional(),
});

const pullResultsUseCase = new PullResultsUseCase();

export const handler = withResultFeedApiKeyAuth(async (event) => pullResultsUseCase.run(event.schema.query), {
  schemas: { query: querySchema },
});
