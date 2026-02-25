import { z } from "zod";

export const tenantSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  displayName: z.string(),
  description: z.string().optional(),
  status: z.string(),
  apiKey: z.string(),
  sso: z.object({
    issuer: z.string(),
    jwksUrl: z.string(),
    clockSkewSec: z.number().optional(),
    maxTtlSec: z.number().optional(),
    replayWindowSec: z.number().optional(),
  }),
  callbackBaseUrl: z.string(),
  apiKeyLastRotatedAt: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Tenant = z.infer<typeof tenantSchema>;
