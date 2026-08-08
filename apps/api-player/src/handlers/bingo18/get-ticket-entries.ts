/**
 * Lambda handler: GET /player/bingo18/tickets/{ticketId}/entries
 * Lấy chi tiết ticket Bingo 18 + tất cả entries thuộc ticket đó.
 */

import { withPlayerAuth } from "@megawin/auth";
import { GetTicketEntriesPlayerUseCase } from "@megawin/game-bingo18-application/use-cases/player";
import { z } from "zod";

import { objectIdSchema } from "#lib/schemas";

const pathSchema = z.object({
  ticketId: objectIdSchema,
});

const useCase = new GetTicketEntriesPlayerUseCase();

export const handler = withPlayerAuth(
  async (event) => {
    const { tenantId, accountId } = event.user;
    const { ticketId } = event.schema.path;

    return useCase.run({ tenantId, accountId, ticketId });
  },
  { schemas: { path: pathSchema } },
);
