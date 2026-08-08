/**
 * Lambda handler: GET /games/power655/tickets/pending
 * Danh sách vé Power 6/55 đang chờ xử lý.
 */

import { withPlayerAuth } from "@megawin/auth";
import { ListPendingTicketsPlayerUseCase } from "@megawin/game-power655-application/use-cases/player";
import { z } from "zod";

import { objectIdSchema, sizeSchema } from "#lib/schemas";

const querySchema = z.object({
  size: sizeSchema,
  cursor: objectIdSchema.optional(),
});

const useCase = new ListPendingTicketsPlayerUseCase();

export const handler = withPlayerAuth(
  async (event) => {
    const { tenantId, accountId } = event.user;
    const { size, cursor } = event.schema.query;

    return useCase.run({ tenantId, accountId, size, cursor });
  },
  { schemas: { query: querySchema } },
);
