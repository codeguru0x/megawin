"use client";

import { useState } from "react";
import {
  Building2,
  Eye,
  EyeOff,
  Copy,
  Check,
  Pencil,
  RefreshCw,
  Globe,
  Key,
  Calendar,
  CheckCircle2,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";

import type { Tenant } from "../_lib/schema";
import {
  useToggleTenantStatus,
  useRegenerateApiKey,
} from "../_lib/use-tenants";
import { EditTenantDialog } from "./edit-tenant-dialog";

export function TenantCard({ tenant }: { tenant: Tenant }) {
  const [editOpen, setEditOpen] = useState(false);
  const [regenDialogOpen, setRegenDialogOpen] = useState(false);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [newApiKey, setNewApiKey] = useState<string | null>(null);
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  const toggleStatus = useToggleTenantStatus();
  const regenKey = useRegenerateApiKey();

  const isActive = tenant.status === "active";
  const nextStatus = isActive ? "disabled" : "active";
  const nextStatusLabel = isActive ? "Vô hiệu hóa" : "Kích hoạt";
  const maskedKey = tenant.apiKey.slice(0, 8) + "••••••••••••••••";

  function handleCopy(key: string) {
    navigator.clipboard.writeText(key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleCloseRegenResult() {
    setNewApiKey(null);
    setCopied(false);
    setRegenDialogOpen(false);
  }

  return (
    <>
      <Card className="overflow-hidden gap-0 py-0">
        {/* Card Header */}
        <CardHeader className="flex-row items-center justify-between gap-3 border-b px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted">
              <Building2 className="size-4.5 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="truncate text-sm font-semibold text-foreground">
                  {tenant.displayName}
                </h3>
                <Badge
                  variant={isActive ? "default" : "destructive"}
                  className="shrink-0 gap-1 text-xs"
                >
                  {isActive ? (
                    <CheckCircle2 className="size-3" />
                  ) : (
                    <XCircle className="size-3" />
                  )}
                  {isActive ? "Hoạt động" : "Vô hiệu"}
                </Badge>
              </div>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {tenant.tenantId}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => setEditOpen(true)}
            >
              <Pencil className="size-3.5" />
              Chỉnh sửa
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => setRegenDialogOpen(true)}
            >
              <RefreshCw className="size-3.5" />
              Tạo API key mới
            </Button>
          </div>
        </CardHeader>

        {/* Card Content */}
        <CardContent className="p-0">
          <div className="grid grid-cols-1 divide-y sm:grid-cols-2 sm:divide-x sm:divide-y-0">
            {/* API Key */}
            <div className="p-6">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-950/40">
                  <Key className="size-4 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold">API Key</p>
                  <p className="text-xs text-muted-foreground">
                    Xác thực khi gọi API
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded-md border bg-muted/50 px-3 py-2 text-xs font-mono">
                  {apiKeyVisible ? tenant.apiKey : maskedKey}
                </code>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setApiKeyVisible((v) => !v)}
                  aria-label={apiKeyVisible ? "Ẩn API key" : "Hiện API key"}
                >
                  {apiKeyVisible ? (
                    <EyeOff className="size-3.5 text-muted-foreground" />
                  ) : (
                    <Eye className="size-3.5 text-muted-foreground" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => handleCopy(tenant.apiKey)}
                  aria-label="Sao chép API key"
                >
                  {copied && !newApiKey ? (
                    <Check className="size-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="size-3.5 text-muted-foreground" />
                  )}
                </Button>
              </div>
            </div>

            {/* Status Toggle */}
            <div className="p-6">
              <div className="mb-4 flex items-center gap-3">
                <div
                  className={`flex size-9 items-center justify-center rounded-lg ${
                    isActive
                      ? "bg-emerald-100 dark:bg-emerald-950/40"
                      : "bg-red-100 dark:bg-red-950/40"
                  }`}
                >
                  {isActive ? (
                    <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <XCircle className="size-4 text-red-500 dark:text-red-400" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-semibold">Trạng thái</p>
                  <p className="text-xs text-muted-foreground">
                    Cho phép truy cập dịch vụ
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  checked={isActive}
                  onCheckedChange={() => setStatusDialogOpen(true)}
                  disabled={toggleStatus.isPending}
                />
                <span
                  className={`text-sm font-medium ${
                    isActive
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-red-500 dark:text-red-400"
                  }`}
                >
                  {isActive ? "Đang hoạt động" : "Đã vô hiệu hoá"}
                </span>
                {toggleStatus.isPending && <Spinner className="size-4" />}
              </div>
            </div>
          </div>

          {/* Info Row */}
          <div className="grid grid-cols-1 divide-y border-t sm:grid-cols-2 sm:divide-x sm:divide-y-0">
            <div className="flex items-center gap-3 px-6 py-4">
              <Globe className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="text-[11px] text-muted-foreground">
                  Callback URL
                </p>
                <p className="truncate text-xs font-medium text-foreground">
                  {tenant.callbackBaseUrl}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 px-6 py-4">
              <Calendar className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="text-[11px] text-muted-foreground">Ngày tạo</p>
                <p className="text-xs font-medium tabular-nums text-foreground">
                  {new Date(tenant.createdAt).toLocaleDateString("vi-VN", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </div>
          </div>
        </CardContent>

        {/* Card Footer */}
        <CardFooter className="justify-between border-t px-6 py-3">
          <p className="text-[11px] tabular-nums text-muted-foreground">
            Cập nhật lần cuối:{" "}
            {new Date(tenant.updatedAt).toLocaleDateString("vi-VN", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
          {tenant.description && (
            <p className="text-[11px] italic text-muted-foreground">
              {tenant.description}
            </p>
          )}
        </CardFooter>
      </Card>

      {/* Edit Dialog */}
      <EditTenantDialog
        tenant={tenant}
        open={editOpen}
        onOpenChange={setEditOpen}
      />

      {/* Toggle Status Confirmation */}
      <AlertDialog open={statusDialogOpen} onOpenChange={setStatusDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {nextStatusLabel} tenant &quot;{tenant.tenantId}&quot;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isActive
                ? "Tenant sẽ bị vô hiệu hóa và không thể truy cập dịch vụ."
                : "Tenant sẽ được kích hoạt lại và có thể truy cập dịch vụ."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={toggleStatus.isPending}>
              Huỷ
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                toggleStatus.mutate(
                  { tenantId: tenant.tenantId, status: nextStatus },
                  { onSuccess: () => setStatusDialogOpen(false) }
                );
              }}
              disabled={toggleStatus.isPending}
            >
              {toggleStatus.isPending ? "Đang xử lý..." : nextStatusLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Regenerate Key Confirmation & Result */}
      {newApiKey ? (
        <Dialog open={!!newApiKey} onOpenChange={handleCloseRegenResult}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>API Key mới</DialogTitle>
              <DialogDescription>
                Sao chép API key mới ngay. Key cũ đã bị thay thế.
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-center gap-2 rounded-md border bg-muted/50 p-3">
              <code className="flex-1 break-all text-sm font-mono">
                {newApiKey}
              </code>
              <Button
                variant="outline"
                size="icon"
                className="shrink-0"
                onClick={() => handleCopy(newApiKey)}
              >
                {copied ? (
                  <Check className="size-4 text-emerald-600" />
                ) : (
                  <Copy className="size-4" />
                )}
              </Button>
            </div>
            <DialogFooter>
              <Button onClick={handleCloseRegenResult}>Đã sao chép</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : (
        <AlertDialog open={regenDialogOpen} onOpenChange={setRegenDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Tạo API key mới cho &quot;{tenant.tenantId}&quot;?
              </AlertDialogTitle>
              <AlertDialogDescription>
                API key hiện tại sẽ bị vô hiệu ngay lập tức. Đối tác cần cập
                nhật key mới để tiếp tục sử dụng dịch vụ.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={regenKey.isPending}>
                Huỷ
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  regenKey.mutate(tenant.tenantId, {
                    onSuccess: (data) => setNewApiKey(data.apiKey),
                  });
                }}
                disabled={regenKey.isPending}
              >
                {regenKey.isPending ? "Đang tạo..." : "Xác nhận"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}
