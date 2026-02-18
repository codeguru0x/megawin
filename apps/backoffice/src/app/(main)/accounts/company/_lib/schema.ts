import { z } from "zod";

export const companyAccountSchema = z.object({
  username: z.string(),
  status: z.string(),
  createdAt: z.string(),
  email: z.string().optional(),
});

export type CompanyAccount = z.infer<typeof companyAccountSchema>;
