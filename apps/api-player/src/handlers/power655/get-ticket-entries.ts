/**
 * Lambda handler: GET /player/power655/tickets/{ticketId}/entries
 *
 * Lấy chi tiết ticket + tất cả entries thuộc ticket đó.
 * Entry result chứa bonusNumber thay vì winningSpecial (so với Lotto 5/35).
 */

import { z } from "zod";

import { withPlayerAuth } from "@megawin/auth";

import { GetTicketEntriesPlayerUseCase } from "@megawin/game-power655-application/use-cases/player";
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
  { schemas: { path: pathSchema } }
);
