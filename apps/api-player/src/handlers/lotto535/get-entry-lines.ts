/**
 * Lambda handler: GET /player/lotto535/entries/{entryId}/lines
 * Lấy danh sách lines (bộ số con) + kết quả match của 1 entry.
 * Chỉ trả khi entry đã settled.
 */

import { withPlayerAuth } from "@megawin/auth";
import { GetEntryLinesPlayerUseCase } from "@megawin/game-lotto535-application/use-cases/player";
import { z } from "zod";

import { lineCursorQuerySchema, objectIdSchema } from "#lib/schemas";

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
  { schemas: { path: pathSchema, query: lineCursorQuerySchema } },
);
