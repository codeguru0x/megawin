import { z } from "zod";

export const tenantSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  displayName: z.string(),
  description: z.string().optional(),
  status: z.string(),
  apiKey: z.string(),
  callbackBaseUrl: z.string(),
  apiKeyLastRotatedAt: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Tenant = z.infer<typeof tenantSchema>;
