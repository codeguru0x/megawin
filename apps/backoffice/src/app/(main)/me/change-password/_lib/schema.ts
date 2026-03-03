import { z } from "zod";

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Vui lòng nhập mật khẩu hiện tại"),
    newPassword: z
      .string()
      .min(8, "Mật khẩu mới tối thiểu 8 ký tự")
      .max(128, "Mật khẩu tối đa 128 ký tự")
      .regex(/[A-Z]/, "Phải có ít nhất 1 chữ hoa")
      .regex(/[a-z]/, "Phải có ít nhất 1 chữ thường")
      .regex(/[0-9]/, "Phải có ít nhất 1 số")
      .regex(/[^A-Za-z0-9]/, "Phải có ít nhất 1 ký tự đặc biệt"),
    confirmPassword: z.string().min(1, "Vui lòng xác nhận mật khẩu mới"),
  })
  .refine((data) => data.newPassword !== data.currentPassword, {
    message: "Mật khẩu mới phải khác mật khẩu hiện tại",
    path: ["newPassword"],
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Xác nhận mật khẩu không khớp",
    path: ["confirmPassword"],
  });

export type ChangePasswordFormValues = z.infer<typeof changePasswordSchema>;

export const PASSWORD_RULES = [
  { label: "Tối thiểu 8 ký tự", test: (v: string) => v.length >= 8 },
  { label: "Có chữ hoa (A-Z)", test: (v: string) => /[A-Z]/.test(v) },
  { label: "Có chữ thường (a-z)", test: (v: string) => /[a-z]/.test(v) },
  { label: "Có số (0-9)", test: (v: string) => /[0-9]/.test(v) },
  {
    label: "Có ký tự đặc biệt (!@#$...)",
    test: (v: string) => /[^A-Za-z0-9]/.test(v),
  },
] as const;
