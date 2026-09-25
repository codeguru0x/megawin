/**
 * Lambda handler: GET /player/keno/tickets/{ticketId}/entries
 * Lấy chi tiết ticket Keno + tất cả entries thuộc ticket đó.
 */

import { withPlayerAuth } from "@megawin/auth";
import { GetTicketEntriesPlayerUseCase } from "@megawin/game-keno-application/use-cases/player";
import { z } from "zod";

import { READ_RATE_LIMIT } from "#lib/rate-limit";
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
  {
    schemas: { path: pathSchema },
    rateLimit: { route: "keno.ticket-entries", ...READ_RATE_LIMIT },
  },
);
