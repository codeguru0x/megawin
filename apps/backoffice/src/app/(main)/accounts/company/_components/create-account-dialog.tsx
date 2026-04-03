"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { cn } from "@/lib/utils";
import { Dices, Eye, EyeOff, Shield, UserPlus, User, AtSign, Lock } from "lucide-react";
import { apiClient, ApiClientError } from "@megawin/next/client";
import { CompanyRole, COMPANY_ROLE_VALUES } from "@megawin/identity/entities";

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
import { useSession } from "@/lib/auth-client";

import { COMPANY_ROLES_OPTIONS } from "../_lib/constants";
import type { CreateCompanyAccountResponse } from "../_lib/types";
import { generatePassword } from "../../_shared/generate-password";
import { accountsKeys } from "@/lib/query-keys/accounts";

const createAccountSchema = z.object({
  username: z.string().min(3, "Tên tài khoản tối thiểu 3 ký tự."),
  password: z.string().min(8, "Mật khẩu tối thiểu 8 ký tự."),
  roles: z
    .array(z.enum(COMPANY_ROLE_VALUES as unknown as [string, ...string[]]))
    .min(1, "Vui lòng chọn ít nhất 1 quyền."),
});

type CreateAccountValues = z.infer<typeof createAccountSchema>;

/** Tính độ mạnh password 0–4 dựa trên length + complexity. */
function getPasswordStrength(pwd: string): number {
  if (pwd.length === 0) return 0;
  let score = 0;
  if (pwd.length >= 8) score++;
  if (pwd.length >= 12) score++;
  if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score++;
  if (/[0-9]/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;
  return Math.min(score, 4);
}

const STRENGTH_CONFIG = [
  { label: "Rất yếu", color: "bg-red-500" },
  { label: "Yếu", color: "bg-orange-500" },
  { label: "Trung bình", color: "bg-yellow-500" },
  { label: "Mạnh", color: "bg-emerald-500" },
  { label: "Rất mạnh", color: "bg-emerald-600" },
] as const;

const ROLE_META: Record<
  CompanyRole,
  { icon: typeof Shield; description: string; iconBg: string; iconColor: string }
> = {
  [CompanyRole.Admin]: {
    icon: Shield,
    description: "Toàn quyền quản trị hệ thống",
    iconBg: "bg-violet-100 dark:bg-violet-900/50",
    iconColor: "text-violet-600 dark:text-violet-400",
  },
  [CompanyRole.Staff]: {
    icon: User,
    description: "Xem và thao tác nghiệp vụ cơ bản",
    iconBg: "bg-blue-100 dark:bg-blue-900/50",
    iconColor: "text-blue-600 dark:text-blue-400",
  },
};

export function CreateCompanyAccountDialog() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const { data: session } = useSession();
  const currentRoles = (session?.user as { roles?: string[] })?.roles ?? [];
  const isCurrentAdmin = currentRoles.includes(CompanyRole.Admin);

  // Nếu không phải admin thì chỉ được tạo tài khoản staff — lọc options hiển thị
  const availableRoleOptions = isCurrentAdmin
    ? COMPANY_ROLES_OPTIONS
    : COMPANY_ROLES_OPTIONS.filter((o) => o.value === CompanyRole.Staff);

  const form = useForm<CreateAccountValues>({
    resolver: zodResolver(createAccountSchema),
    defaultValues: {
      username: "",
      password: "",
      // Staff mặc định checked; admin chỉ được pre-select staff
      roles: [CompanyRole.Staff],
    },
  });

  const selectedRoles = useWatch({ control: form.control, name: "roles" });
  const passwordValue = useWatch({ control: form.control, name: "password" });
  const strength = getPasswordStrength(passwordValue ?? "");

  const mutation = useMutation({
    mutationFn: (values: CreateAccountValues) =>
      apiClient.post<CreateCompanyAccountResponse>("/accounts/company", values),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: accountsKeys.company });
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
    form.setValue("password", generatePassword(12), { shouldValidate: true });
    setShowPassword(true);
  }

  function handleRoleChange(role: string) {
    // Radio behavior: chỉ được chọn 1 quyền tại 1 thời điểm
    form.setValue("roles", [role], { shouldValidate: true });
  }

  function handleOpenChange(value: boolean) {
    if (!value) form.reset();
    setOpen(value);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm">
          <UserPlus className="mr-1.5 size-4" />
          Thêm tài khoản
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-indigo-500 to-indigo-600 shadow-sm">
              <UserPlus className="size-4.5 text-white" />
            </div>
            <div>
              <DialogTitle>Tạo tài khoản công ty</DialogTitle>
              <DialogDescription className="text-xs">
                {isCurrentAdmin
                  ? "Tạo tài khoản với quyền Admin hoặc Staff."
                  : "Tạo tài khoản với quyền Staff. Chỉ Admin mới có thể tạo tài khoản Admin."}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-4 pt-1">
            {/* Username */}
            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-medium">Tên tài khoản</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <AtSign className="absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="vd: admin.company"
                        autoComplete="off"
                        className="pl-8.5 text-sm"
                        {...field}
                      />
                    </div>
                  </FormControl>
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />

            {/* Password */}
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-medium">Mật khẩu</FormLabel>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Lock className="absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
                      <FormControl>
                        <Input
                          type={showPassword ? "text" : "password"}
                          placeholder="Tối thiểu 8 ký tự"
                          autoComplete="new-password"
                          className="pr-10 pl-8.5 text-sm font-mono"
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
                          <EyeOff className="size-3.5 text-muted-foreground" />
                        ) : (
                          <Eye className="size-3.5 text-muted-foreground" />
                        )}
                      </Button>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={handleGenerate}
                      title="Tạo mật khẩu ngẫu nhiên"
                      className="shrink-0"
                    >
                      <Dices className="size-3.5" />
                    </Button>
                  </div>
                  {/* Password strength bar */}
                  {(passwordValue?.length ?? 0) > 0 && (
                    <div className="space-y-1">
                      <div className="flex gap-1">
                        {Array.from({ length: 4 }).map((_, i) => (
                          <div
                            key={i}
                            className={cn(
                              "h-1 flex-1 rounded-full transition-all duration-300",
                              i < strength
                                ? (STRENGTH_CONFIG[strength]?.color ?? "bg-muted")
                                : "bg-muted",
                            )}
                          />
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Độ mạnh: {STRENGTH_CONFIG[strength]?.label}
                      </p>
                    </div>
                  )}
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />

            {/* Roles */}
            <FormField
              control={form.control}
              name="roles"
              render={() => (
                <FormItem>
                  <FormLabel className="text-xs font-medium">Phân quyền</FormLabel>
                  <div className="grid gap-2">
                    {availableRoleOptions.map((opt) => {
                      const checked = selectedRoles?.includes(opt.value);
                      const meta = ROLE_META[opt.value as CompanyRole];
                      const RoleIcon = meta?.icon ?? User;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => handleRoleChange(opt.value)}
                          className={cn(
                            "flex items-center gap-3 rounded-lg border p-3 text-left transition-all",
                            checked
                              ? "border-primary/40 bg-primary/5 ring-1 ring-primary/20"
                              : "border-border bg-card hover:bg-muted/50",
                          )}
                        >
                          <div
                            className={cn(
                              "flex size-8 shrink-0 items-center justify-center rounded-lg",
                              meta?.iconBg,
                            )}
                          >
                            <RoleIcon className={cn("size-4", meta?.iconColor)} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium leading-none">{opt.label}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {meta?.description}
                            </p>
                          </div>
                          <div
                            className={cn(
                              "size-4 shrink-0 rounded-full border-2 transition-all",
                              checked ? "border-primary bg-primary" : "border-muted-foreground/30",
                            )}
                          />
                        </button>
                      );
                    })}
                  </div>
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />

            <DialogFooter className="gap-2 pt-1 sm:gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleOpenChange(false)}
                disabled={mutation.isPending}
              >
                Huỷ
              </Button>
              <Button type="submit" size="sm" disabled={mutation.isPending}>
                {mutation.isPending ? "Đang tạo..." : "Tạo tài khoản"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
