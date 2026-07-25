"use client";

import { useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { ApiClientError, apiClient } from "@megawin/next/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dices, Eye, EyeOff } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Badge } from "@/components/ui/badge";
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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTenantOptions } from "@/hooks/use-tenant-options";
import { accountsKeys } from "@/lib/query-keys/accounts";

import { generatePassword } from "../../_shared/generate-password";
import type { CreateAgentAccountResponse } from "../_lib/types";

const createAgentSchema = z.object({
  username: z.string().min(3, "Tên tài khoản tối thiểu 3 ký tự."),
  password: z.string().min(8, "Mật khẩu tối thiểu 8 ký tự."),
  tenantId: z.string().min(1, "Vui lòng chọn Tenant."),
});

type CreateAgentValues = z.infer<typeof createAgentSchema>;

export function CreateAgentAccountDialog() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { data: tenantData, isLoading: isLoadingTenants } = useTenantOptions();

  const tenants = tenantData?.tenants ?? [];

  const form = useForm<CreateAgentValues>({
    resolver: zodResolver(createAgentSchema),
    defaultValues: {
      username: "",
      password: "",
      tenantId: "",
    },
  });

  const mutation = useMutation({
    mutationFn: (values: CreateAgentValues) => apiClient.post<CreateAgentAccountResponse>("/accounts/agents", values),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: accountsKeys.agents });
      setOpen(false);
      form.reset();
      toast.success("Tạo tài khoản đại lý thành công.", {
        description: `Tài khoản: ${data.username} – Tenant: ${data.tenantId}`,
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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Thêm đại lý</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tạo tài khoản đại lý</DialogTitle>
          <DialogDescription>
            Tạo tài khoản đại lý mới. Quyền mặc định là{" "}
            <Badge variant="secondary" className="text-xs">
              Agent
            </Badge>
            . Mật khẩu tạm thời, người dùng sẽ phải đổi khi đăng nhập lần đầu. Mỗi Tenant chỉ được gán 1 đại lý duy
            nhất.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
            <FormField
              control={form.control}
              name="tenantId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tenant</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={isLoadingTenants ? "Đang tải..." : "Chọn Tenant"} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {tenants.map((t) => (
                        <SelectItem key={t.tenantId} value={t.tenantId}>
                          {t.displayName} ({t.tenantId})
                        </SelectItem>
                      ))}
                      {tenants.length === 0 && !isLoadingTenants && (
                        <div className="px-2 py-4 text-center text-sm text-muted-foreground">Chưa có Tenant nào.</div>
                      )}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tên tài khoản</FormLabel>
                  <FormControl>
                    <Input placeholder="vd: agent.partner1" autoComplete="off" {...field} />
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

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={mutation.isPending}>
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
