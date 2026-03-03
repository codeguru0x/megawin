"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  EllipsisVertical,
  Pencil,
  ToggleLeft,
  ToggleRight,
  RefreshCw,
  Copy,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { apiClient, ApiClientError } from "@megawin/next/client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

import type { Tenant } from "../_lib/schema";
import type {
  UpdateTenantStatusResponse,
  RegenerateApiKeyResponse,
} from "../_lib/types";
import { EditTenantDialog } from "./edit-tenant-dialog";

export function TenantRowActions({ tenant }: { tenant: Tenant }) {
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [regenDialogOpen, setRegenDialogOpen] = useState(false);
  const [newApiKey, setNewApiKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const isActive = tenant.status === "active";
  const nextStatus = isActive ? "disabled" : "active";
  const nextStatusLabel = isActive ? "Vô hiệu hóa" : "Kích hoạt";

  const statusMutation = useMutation({
    mutationFn: () =>
      apiClient.patch<UpdateTenantStatusResponse>("/tenants/status", {
        tenantId: tenant.tenantId,
        status: nextStatus,
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["tenants"] });
      setStatusDialogOpen(false);
      toast.success(
        `Đã ${data.status === "active" ? "kích hoạt" : "vô hiệu hóa"} tenant "${tenant.tenantId}".`,
      );
    },
    onError: (error) => {
      toast.error(
        error instanceof ApiClientError
          ? error.message
          : "Không thể cập nhật trạng thái.",
      );
    },
  });

  const regenMutation = useMutation({
    mutationFn: () =>
      apiClient.post<RegenerateApiKeyResponse>("/tenants/regenerate-key", {
        tenantId: tenant.tenantId,
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["tenants"] });
      setNewApiKey(data.apiKey);
      toast.success("Đã tạo API key mới.");
    },
    onError: (error) => {
      toast.error(
        error instanceof ApiClientError
          ? error.message
          : "Không thể tạo API key mới.",
      );
    },
  });

  function handleCopy() {
    if (newApiKey) {
      navigator.clipboard.writeText(newApiKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  function handleCloseRegenResult() {
    setNewApiKey(null);
    setCopied(false);
    setRegenDialogOpen(false);
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="size-8 text-muted-foreground data-[state=open]:bg-muted"
            size="icon"
            aria-label="Mở menu thao tác"
          >
            <EllipsisVertical />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onClick={() => setEditOpen(true)}>
            <Pencil className="mr-2 h-4 w-4" />
            Chỉnh sửa
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setStatusDialogOpen(true)}>
            {isActive ? (
              <ToggleLeft className="mr-2 h-4 w-4" />
            ) : (
              <ToggleRight className="mr-2 h-4 w-4" />
            )}
            {nextStatusLabel}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setRegenDialogOpen(true)}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Tạo API key mới
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <EditTenantDialog
        tenant={tenant}
        open={editOpen}
        onOpenChange={setEditOpen}
      />

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
            <AlertDialogCancel disabled={statusMutation.isPending}>
              Huỷ
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                statusMutation.mutate();
              }}
              disabled={statusMutation.isPending}
            >
              {statusMutation.isPending ? "Đang xử lý..." : nextStatusLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
              <AlertDialogCancel disabled={regenMutation.isPending}>
                Huỷ
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  regenMutation.mutate();
                }}
                disabled={regenMutation.isPending}
              >
                {regenMutation.isPending ? "Đang tạo..." : "Xác nhận"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}
