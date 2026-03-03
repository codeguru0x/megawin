import { z } from "zod";
import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities/account";
import { ChangeMyPasswordUseCase } from "@megawin/identity-application/use-cases/accounts";

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Vui lòng nhập mật khẩu hiện tại"),
    newPassword: z
      .string()
      .min(8, "Mật khẩu mới tối thiểu 8 ký tự")
      .max(128, "Mật khẩu tối đa 128 ký tự")
      .regex(/[A-Z]/, "Mật khẩu phải có ít nhất 1 chữ hoa")
      .regex(/[a-z]/, "Mật khẩu phải có ít nhất 1 chữ thường")
      .regex(/[0-9]/, "Mật khẩu phải có ít nhất 1 số")
      .regex(/[^A-Za-z0-9]/, "Mật khẩu phải có ít nhất 1 ký tự đặc biệt"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword !== data.currentPassword, {
    message: "Mật khẩu mới phải khác mật khẩu hiện tại",
    path: ["newPassword"],
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Xác nhận mật khẩu không khớp",
    path: ["confirmPassword"],
  });

const changeMyPasswordUseCase = new ChangeMyPasswordUseCase();

export const POST = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .body(changePasswordSchema)
  .handler(async ({ body, session }) => {
    const username = session!.user.username;

    return changeMyPasswordUseCase.run({
      username,
      currentPassword: body.currentPassword,
      newPassword: body.newPassword,
    });
  });
