import { z } from "zod";

export const companyAccountRoles = ["admin", "manager", "staff"] as const;

export const companyAccountSchema = z.object({
  id: z.string(),
  username: z.string(),
  roles: z.array(z.enum(companyAccountRoles)).min(1),
  status: z.enum(["active", "inactive"]),
  mfaEnabled: z.boolean(),
  createdAt: z.string(),
});

export type CompanyAccount = z.infer<typeof companyAccountSchema>;

