import { z } from "zod";
import { COMPANY_ROLE_VALUES } from "@megawin/identity-domain/accounts/account";

export const createAccountSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(8).max(128),
  roles: z
    .array(z.enum(COMPANY_ROLE_VALUES as unknown as [string, ...string[]]))
    .min(1),
});

export const listQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(60).optional(),
  paginationToken: z.string().optional(),
});
