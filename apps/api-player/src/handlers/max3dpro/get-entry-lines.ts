/**
 * Lambda handler: GET /games/max3dpro/entries/{entryId}/lines
 * Lấy danh sách lines (bộ ba số) + kết quả match của 1 entry.
 * Chỉ trả khi entry đã settled.
 */

import { z } from "zod";

import { withPlayerAuth } from "@megawin/auth";

import { GetEntryLinesPlayerUseCase } from "@megawin/game-max3dpro-application/use-cases/player";
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
  { schemas: { path: pathSchema, query: lineCursorQuerySchema } },
);
