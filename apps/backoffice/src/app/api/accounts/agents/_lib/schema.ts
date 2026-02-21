import { z } from "zod";

export const createAgentSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(8).max(128),
  tenantId: z.string().min(1),
});
