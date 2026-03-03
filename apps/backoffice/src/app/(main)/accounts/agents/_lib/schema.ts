import { z } from "zod";

export const agentAccountSchema = z.object({
  accountId: z.string(),
  username: z.string(),
  displayName: z.string(),
  status: z.string(),
  mfaStatus: z.string(),
  tenantId: z.string(),
  roles: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type AgentAccount = z.infer<typeof agentAccountSchema>;
