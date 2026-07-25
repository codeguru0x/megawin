import { z } from "zod";

const rate = z.number().min(0).max(1);

export const updateTenantConfigSchema = z
  .object({
    commissionRate: rate.optional(),
    isEnabled: z.boolean().optional(),
  })
  .refine((data) => data.commissionRate !== undefined || data.isEnabled !== undefined, {
    message: "Phải cung cấp ít nhất một field để cập nhật.",
  });

export const tenantIdParamSchema = z.object({
  tenantId: z.string().min(1, "tenantId không được để trống").max(128, "tenantId quá dài"),
});
