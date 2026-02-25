import { z } from "zod";

export const companyAccountSchema = z.object({
  accountId: z.string(),
  username: z.string(),
  displayName: z.string(),
  status: z.string(),
  roles: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type CompanyAccount = z.infer<typeof companyAccountSchema>;
