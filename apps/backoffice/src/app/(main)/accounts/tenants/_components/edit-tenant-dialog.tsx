"use client";

import { useEffect } from "react";
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
import { Textarea } from "@/components/ui/textarea";

import type { Tenant } from "../_lib/schema";
import type { UpdateTenantResponse } from "../_lib/types";

const editTenantSchema = z.object({
  displayName: z.string().min(1, "Tên hiển thị không được trống.").max(100),
  description: z.string().max(500).optional(),
  jwksUrl: z.string().url("JWKS URL không hợp lệ."),
  callbackBaseUrl: z.string().url("Callback Base URL không hợp lệ."),
});

type EditTenantValues = z.infer<typeof editTenantSchema>;

interface EditTenantDialogProps {
  tenant: Tenant;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditTenantDialog({
  tenant,
  open,
  onOpenChange,
}: EditTenantDialogProps) {
  const queryClient = useQueryClient();

  const form = useForm<EditTenantValues>({
    resolver: zodResolver(editTenantSchema),
    defaultValues: {
      displayName: tenant.displayName,
      description: tenant.description ?? "",
      jwksUrl: tenant.sso.jwksUrl,
      callbackBaseUrl: tenant.callbackBaseUrl,
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        displayName: tenant.displayName,
        description: tenant.description ?? "",
        jwksUrl: tenant.sso.jwksUrl,
        callbackBaseUrl: tenant.callbackBaseUrl,
      });
    }
  }, [open, tenant, form]);

  const mutation = useMutation({
    mutationFn: (values: EditTenantValues) =>
      apiClient.patch<UpdateTenantResponse>("/tenants", {
        tenantId: tenant.tenantId,
        displayName: values.displayName,
        description: values.description,
        jwksUrl: values.jwksUrl,
        callbackBaseUrl: values.callbackBaseUrl,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenants"] });
      onOpenChange(false);
      toast.success(`Đã cập nhật tenant "${tenant.tenantId}".`);
    },
    onError: (error) => {
      toast.error(
        error instanceof ApiClientError
          ? error.message
          : "Đã xảy ra lỗi khi cập nhật.",
      );
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Chỉnh sửa đối tác</DialogTitle>
          <DialogDescription>
            Tenant ID:{" "}
            <code className="font-mono text-foreground">
              {tenant.tenantId}
            </code>
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="displayName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tên hiển thị</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Mô tả{" "}
                    <span className="text-muted-foreground font-normal">
                      (tuỳ chọn)
                    </span>
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      className="resize-none"
                      rows={2}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="jwksUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>JWKS URL</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="https://example.com/.well-known/jwks.json"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="callbackBaseUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Callback Base URL</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="https://api.example.com"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={mutation.isPending}
              >
                Huỷ
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? "Đang lưu..." : "Lưu thay đổi"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
