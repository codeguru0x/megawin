/**
 * Lambda handler: GET /games/max3dpro/tickets/{ticketId}/entries
 * Lấy chi tiết ticket + tất cả entries thuộc ticket đó.
 */

import { z } from "zod";

import { withPlayerAuth } from "@megawin/auth";

import { GetTicketEntriesPlayerUseCase } from "@megawin/game-max3dpro-application/use-cases/player";
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
