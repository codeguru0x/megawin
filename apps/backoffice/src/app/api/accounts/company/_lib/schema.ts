import { COMPANY_ROLE_VALUES } from "@megawin/identity/entities";
import { z } from "zod";

export const createAccountSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(8).max(128),
  roles: z.array(z.enum(COMPANY_ROLE_VALUES as unknown as [string, ...string[]])).min(1),
});
