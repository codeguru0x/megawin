import { z } from "zod";

export const agentAccountSchema = z.object({
  username: z.string(),
  status: z.string(),
  createdAt: z.string(),
  email: z.string().optional(),
});

export type AgentAccount = z.infer<typeof agentAccountSchema>;
