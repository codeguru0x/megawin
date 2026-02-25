import { z } from "zod";

export const playerAccountSchema = z.object({
  username: z.string(),
  status: z.string(),
  createdAt: z.string(),
  email: z.string().optional(),
});

export type PlayerAccount = z.infer<typeof playerAccountSchema>;
