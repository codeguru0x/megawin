import { z } from "zod";
import {
  TenantStatus,
  TENANT_STATUS_VALUES,
} from "@megawin/identity-domain/tenants/tenant";

export const createTenantSchema = z.object({
  tenantId: z
    .string()
    .min(2, "Tenant ID tối thiểu 2 ký tự.")
    .max(32, "Tenant ID tối đa 32 ký tự.")
    .regex(/^[a-zA-Z0-9_]+$/, "Chỉ cho phép chữ, số và dấu gạch dưới."),
  displayName: z
    .string()
    .min(1, "Tên hiển thị không được trống.")
    .max(100),
  description: z.string().max(500).optional(),
  jwksUrl: z.url({ message: "JWKS URL không hợp lệ." }),
  allowedOrigins: z
    .array(z.url({ message: "Origin không hợp lệ." }))
    .min(1, "Phải có ít nhất 1 origin."),
});

export const updateTenantStatusSchema = z.object({
  tenantId: z.string().min(1),
  status: z.enum(TENANT_STATUS_VALUES as [TenantStatus, ...TenantStatus[]]),
});

export const regenerateApiKeySchema = z.object({
  tenantId: z.string().min(1),
});

export const updateTenantSchema = z.object({
  tenantId: z.string().min(1),
  displayName: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  jwksUrl: z.url({ message: "JWKS URL không hợp lệ." }).optional(),
  allowedOrigins: z
    .array(z.url({ message: "Origin không hợp lệ." }))
    .min(1, "Phải có ít nhất 1 origin.")
    .optional(),
});
