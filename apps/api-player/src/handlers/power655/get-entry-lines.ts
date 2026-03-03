/**
 * Lambda handler: GET /player/power655/entries/{entryId}/lines
 *
 * Lấy danh sách lines (bộ số con) + kết quả match của 1 entry.
 * Chỉ trả khi entry đã settled.
 *
 * Power 6/55: lines chỉ có mainNumbers, matchResult chứa bonusMatched
 * thay vì specialMatched (so với Lotto 5/35).
 */

import { z } from "zod";

import { withPlayerAuth } from "@megawin/auth";

import { GetEntryLinesPlayerUseCase } from "@megawin/game-power655-application/use-cases/player";
import { objectIdSchema, lineCursorQuerySchema } from "#lib/schemas";

const pathSchema = z.object({
  entryId: objectIdSchema,
});

const useCase = new GetEntryLinesPlayerUseCase();

export const handler = withPlayerAuth(
  async (event) => {
    const { tenantId, accountId } = event.user;
    const { entryId } = event.schema.path;
    const { size, cursor } = event.schema.query;

    return useCase.run({ tenantId, accountId, entryId, size, cursor });
  },
  { schemas: { path: pathSchema, query: lineCursorQuerySchema } }
);
