"use client";

import { useEffect } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import type { Tenant } from "../_lib/schema";
import { useUpdateTenant } from "../_lib/use-tenants";

const editTenantSchema = z.object({
  displayName: z.string().min(1, "Tên hiển thị không được trống.").max(100),
  description: z.string().max(500).optional(),
  callbackBaseUrl: z.string().url("Callback Base URL không hợp lệ."),
});

type EditTenantValues = z.infer<typeof editTenantSchema>;

interface EditTenantDialogProps {
  tenant: Tenant;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditTenantDialog({ tenant, open, onOpenChange }: EditTenantDialogProps) {
  const mutation = useUpdateTenant();

  const form = useForm<EditTenantValues>({
    resolver: zodResolver(editTenantSchema),
    defaultValues: {
      displayName: tenant.displayName,
      description: tenant.description ?? "",
      callbackBaseUrl: tenant.callbackBaseUrl,
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        displayName: tenant.displayName,
        description: tenant.description ?? "",
        callbackBaseUrl: tenant.callbackBaseUrl,
      });
    }
  }, [open, tenant, form]);

  function handleSubmit(values: EditTenantValues) {
    mutation.mutate(
      {
        tenantId: tenant.tenantId,
        displayName: values.displayName,
        description: values.description,
        callbackBaseUrl: values.callbackBaseUrl,
      },
      { onSuccess: () => onOpenChange(false) },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Chỉnh sửa đối tác</DialogTitle>
          <DialogDescription>
            Tenant ID: <code className="font-mono text-foreground">{tenant.tenantId}</code>
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
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
                    Mô tả <span className="text-muted-foreground font-normal">(tuỳ chọn)</span>
                  </FormLabel>
                  <FormControl>
                    <Textarea className="resize-none" rows={2} {...field} />
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
                    <Input placeholder="https://api.example.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
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
