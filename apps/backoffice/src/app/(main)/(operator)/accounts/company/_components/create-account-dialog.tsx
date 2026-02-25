"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Dices, Eye, EyeOff } from "lucide-react";
import { apiClient, ApiClientError } from "@megawin/next/client";
import {
  CompanyRole,
  COMPANY_ROLE_VALUES,
} from "@megawin/identity/entities/account";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";

import { COMPANY_ROLES_OPTIONS } from "../_lib/constants";
import type { CreateCompanyAccountResponse } from "../_lib/types";
import { generatePassword } from "../../_shared/generate-password";

const createAccountSchema = z.object({
  username: z.string().min(3, "Tên tài khoản tối thiểu 3 ký tự."),
  password: z.string().min(8, "Mật khẩu tối thiểu 8 ký tự."),
  roles: z
    .array(z.enum(COMPANY_ROLE_VALUES as unknown as [string, ...string[]]))
    .min(1, "Vui lòng chọn ít nhất 1 quyền."),
});

type CreateAccountValues = z.infer<typeof createAccountSchema>;

export function CreateCompanyAccountDialog() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const form = useForm<CreateAccountValues>({
    resolver: zodResolver(createAccountSchema),
    defaultValues: {
      username: "",
      password: "",
      roles: [CompanyRole.Staff],
    },
  });

  const selectedRoles = useWatch({ control: form.control, name: "roles" });
  const isAdminSelected = selectedRoles?.includes(CompanyRole.Admin);

  const mutation = useMutation({
    mutationFn: (values: CreateAccountValues) =>
      apiClient.post<CreateCompanyAccountResponse>(
        "/accounts/company",
        values
      ),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["company", "accounts"] });
      setOpen(false);
      form.reset();
      toast.success("Tạo tài khoản thành công.", {
        description: `Tài khoản: ${data.username} – Quyền: ${data.roles.join(", ")}`,
      });
    },
    onError: (error) => {
      if (error instanceof ApiClientError) {
        toast.error(error.message);
      } else {
        toast.error("Đã xảy ra lỗi khi tạo tài khoản.");
      }
    },
  });

  function handleGenerate() {
    form.setValue("password", generatePassword(8));
    setShowPassword(true);
  }

  function handleRoleChange(role: string, checked: boolean) {
    const current = form.getValues("roles") ?? [];

    if (role === CompanyRole.Admin && checked) {
      form.setValue("roles", [CompanyRole.Admin], { shouldValidate: true });
      return;
    }

    const next = checked
      ? [...current, role]
      : current.filter((r) => r !== role);
    form.setValue("roles", next, { shouldValidate: true });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Thêm tài khoản</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tạo tài khoản công ty</DialogTitle>
          <DialogDescription>
            Tạo tài khoản mới với quyền Admin hoặc Staff. Mật khẩu tạm thời,
            người dùng sẽ phải đổi khi đăng nhập lần đầu.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tên tài khoản</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="vd: admin.company"
                      autoComplete="off"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Mật khẩu</FormLabel>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <FormControl>
                        <Input
                          type={showPassword ? "text" : "password"}
                          placeholder="Tối thiểu 8 ký tự"
                          autoComplete="new-password"
                          className="pr-10"
                          {...field}
                        />
                      </FormControl>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute top-0 right-0 h-full px-3 hover:bg-transparent"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Eye className="h-4 w-4 text-muted-foreground" />
                        )}
                      </Button>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={handleGenerate}
                      title="Tạo mật khẩu ngẫu nhiên"
                    >
                      <Dices className="h-4 w-4" />
                    </Button>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="roles"
              render={() => (
                <FormItem>
                  <FormLabel>Quyền</FormLabel>
                  <div className="space-y-2">
                    {COMPANY_ROLES_OPTIONS.map((opt) => {
                      const checked = selectedRoles?.includes(opt.value);
                      const disabled =
                        isAdminSelected && opt.value !== CompanyRole.Admin;
                      return (
                        <label
                          key={opt.value}
                          className={`flex items-center gap-2 text-sm ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
                        >
                          <Checkbox
                            checked={checked}
                            disabled={disabled}
                            onCheckedChange={(v) =>
                              handleRoleChange(opt.value, Boolean(v))
                            }
                          />
                          <span>{opt.label}</span>
                        </label>
                      );
                    })}
                  </div>
                  {isAdminSelected && (
                    <p className="text-muted-foreground text-xs">
                      Quản trị viên có toàn quyền, không cần chọn thêm quyền
                      khác.
                    </p>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={mutation.isPending}
              >
                Huỷ
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? "Đang tạo..." : "Tạo tài khoản"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
