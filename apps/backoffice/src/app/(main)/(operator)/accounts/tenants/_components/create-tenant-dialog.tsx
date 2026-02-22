"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Copy, Check } from "lucide-react";
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

import type { CreateTenantResponse } from "../_lib/types";

const createTenantSchema = z.object({
  tenantId: z
    .string()
    .min(2, "Tenant ID tối thiểu 2 ký tự.")
    .max(32)
    .regex(/^[a-zA-Z0-9_]+$/, "Chỉ cho phép chữ, số và dấu gạch dưới."),
  displayName: z.string().min(1, "Tên hiển thị không được trống.").max(100),
  description: z.string().max(500).optional(),
  jwksUrl: z.string().url("JWKS URL không hợp lệ."),
  allowedOrigins: z.string().min(1, "Phải có ít nhất 1 origin."),
});

type CreateTenantValues = z.infer<typeof createTenantSchema>;

export function CreateTenantDialog() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [createdApiKey, setCreatedApiKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const form = useForm<CreateTenantValues>({
    resolver: zodResolver(createTenantSchema),
    defaultValues: {
      tenantId: "",
      displayName: "",
      description: "",
      jwksUrl: "",
      allowedOrigins: "",
    },
  });

  const mutation = useMutation({
    mutationFn: (values: CreateTenantValues) => {
      const origins = values.allowedOrigins
        .split(",")
        .map((o) => o.trim())
        .filter(Boolean);
      return apiClient.post<CreateTenantResponse>("/tenants", {
        tenantId: values.tenantId,
        displayName: values.displayName,
        description: values.description,
        jwksUrl: values.jwksUrl,
        allowedOrigins: origins,
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["tenants"] });
      form.reset();
      setCreatedApiKey(data.apiKey);
      toast.success(`Tạo tenant "${data.tenantId}" thành công.`);
    },
    onError: (error) => {
      if (error instanceof ApiClientError) {
        toast.error(error.message);
      } else {
        toast.error("Đã xảy ra lỗi khi tạo tenant.");
      }
    },
  });

  function handleCopy() {
    if (createdApiKey) {
      navigator.clipboard.writeText(createdApiKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  function handleClose(value: boolean) {
    if (!value) {
      setCreatedApiKey(null);
      setCopied(false);
      form.reset();
    }
    setOpen(value);
  }

  if (createdApiKey) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogTrigger asChild>
          <Button size="sm">Thêm đối tác</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>API Key đã được tạo</DialogTitle>
            <DialogDescription>
              Hãy sao chép API key này ngay. Sau khi đóng dialog bạn sẽ không
              thể xem lại key dưới dạng đầy đủ.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 rounded-md border bg-muted/50 p-3">
            <code className="flex-1 break-all text-sm font-mono">
              {createdApiKey}
            </code>
            <Button
              variant="outline"
              size="icon"
              className="shrink-0"
              onClick={handleCopy}
            >
              {copied ? (
                <Check className="h-4 w-4 text-green-600" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => handleClose(false)}>Đã sao chép</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogTrigger asChild>
        <Button size="sm">Thêm đối tác</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Tạo đối tác mới</DialogTitle>
          <DialogDescription>
            API key sẽ được tự động sinh sau khi tạo. Trạng thái mặc định là
            &quot;Vô hiệu&quot;.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="tenantId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tenant ID</FormLabel>
                  <FormControl>
                    <Input placeholder="vd: acme" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="displayName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tên hiển thị</FormLabel>
                  <FormControl>
                    <Input placeholder="vd: ACME Corporation" {...field} />
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
                      placeholder="Thông tin bổ sung về đối tác..."
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
              name="allowedOrigins"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Allowed Origins</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="https://app.example.com, https://admin.example.com"
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
                onClick={() => handleClose(false)}
                disabled={mutation.isPending}
              >
                Huỷ
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? "Đang tạo..." : "Tạo đối tác"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
