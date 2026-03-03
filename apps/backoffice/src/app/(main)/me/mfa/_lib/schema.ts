import { z } from "zod";

export const setupMfaSchema = z.object({
  password: z.string().min(1, "Vui lòng nhập mật khẩu"),
});

export type SetupMfaFormValues = z.infer<typeof setupMfaSchema>;

export const verifyMfaSchema = z.object({
  totpCode: z
    .string()
    .length(6, "Mã xác thực phải có 6 chữ số")
    .regex(/^\d{6}$/, "Mã xác thực chỉ chứa số"),
});

export type VerifyMfaFormValues = z.infer<typeof verifyMfaSchema>;

export const disableMfaSchema = z.object({
  password: z.string().min(1, "Vui lòng nhập mật khẩu"),
  totpCode: z
    .string()
    .length(6, "Mã xác thực phải có 6 chữ số")
    .regex(/^\d{6}$/, "Mã xác thực chỉ chứa số"),
});

export type DisableMfaFormValues = z.infer<typeof disableMfaSchema>;

export interface MfaStatusResponse {
  mfaStatus: "none" | "enabled" | "disabled";
  cognitoMfaEnabled: boolean;
  preferredMethod: string | null;
}

export interface SetupMfaResponse {
  secretCode: string;
  otpauthUri: string;
  session: string;
  accessToken: string;
}
