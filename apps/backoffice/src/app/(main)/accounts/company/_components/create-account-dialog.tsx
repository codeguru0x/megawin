"use client";

import { useState } from "react";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { apiClient, ApiClientError } from "@megawin/next/client";

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
import { Checkbox } from "@/components/ui/checkbox";

import { COMPANY_ACCOUNT_ROLES } from "../_lib/constants";
import type { CreateCompanyAccountResponse } from "../_lib/types";

const CreateAccountSchema = z.object({
  username: z.string().min(3, { message: "Tên tài khoản tối thiểu 3 ký tự." }),
  password: z.string().min(8, { message: "Mật khẩu tối thiểu 8 ký tự." }),
  roles: z.array(z.string()).min(1, { message: "Vui lòng chọn ít nhất 1 quyền." }),
});

type CreateAccountValues = z.infer<typeof CreateAccountSchema>;

export function CreateAccountDialog() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const form = useForm<CreateAccountValues>({
    resolver: zodResolver(CreateAccountSchema),
    defaultValues: {
      username: "",
      password: "",
      roles: ["Staff"],
    },
  });

  const mutation = useMutation({
    mutationFn: (values: CreateAccountValues) =>
      apiClient.post<CreateCompanyAccountResponse>(
        "/accounts/company",
        values,
      ),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["company", "accounts"] });
      setOpen(false);
      form.reset();

      toast.success("Tạo tài khoản công ty thành công.", {
        description: (
          <span className="text-xs">
            Tài khoản: <strong>{data.username}</strong> - Quyền:{" "}
            <strong>{data.roles.join(", ")}</strong>
          </span>
        ),
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

  const onSubmit = (values: CreateAccountValues) => {
    mutation.mutate(values);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Thêm tài khoản</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tạo tài khoản công ty</DialogTitle>
          <DialogDescription>
            Nhập thông tin tài khoản mới. Mật khẩu có thể được thay đổi lại sau trong phần thao tác.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tên tài khoản</FormLabel>
                  <FormControl>
                    <Input placeholder="vd: admin.company" autoComplete="off" {...field} />
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
                  <FormControl>
                    <Input type="password" placeholder="••••••••" autoComplete="new-password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="roles"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Quyền</FormLabel>
                  <div className="space-y-1">
                    {COMPANY_ACCOUNT_ROLES.map((role) => {
                      const checked = Array.isArray(field.value) && field.value.includes(role);
                      return (
                        <label key={role} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(value) => {
                              const isChecked = Boolean(value);
                              const current = Array.isArray(field.value) ? field.value : [];
                              field.onChange(
                                isChecked
                                  ? [...current, role]
                                  : current.filter((r: string) => r !== role),
                              );
                            }}
                          />
                          <span>{role}</span>
                        </label>
                      );
                    })}
                  </div>
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
