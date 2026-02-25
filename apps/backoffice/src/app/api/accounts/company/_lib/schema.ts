import { z } from "zod";
import { COMPANY_ROLE_VALUES } from "@megawin/identity/entities/account";

export const createAccountSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(8).max(128),
  roles: z
    .array(z.enum(COMPANY_ROLE_VALUES as unknown as [string, ...string[]]))
    .min(1),
});
