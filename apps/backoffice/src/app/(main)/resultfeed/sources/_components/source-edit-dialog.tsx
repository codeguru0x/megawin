"use client";

import { useEffect, useState } from "react";

import { ResultFeedGameKey, ResultFeedProviderId, type SourceEntity, SourceRole } from "@megawin/resultfeed/entities";
import { AlertTriangle } from "lucide-react";

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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

import { PROVIDER_ID_LABELS, RESULTFEED_GAME_LABELS, SOURCE_ROLE_LABELS } from "../../_lib/labels";
import { type UpdateSourceInput, useUpdateSource } from "../../_lib/use-queries";

export interface SourceEditDialogProps {
  source: SourceEntity | null;
  onClose: () => void;
}

type FormState = UpdateSourceInput;

function toFormState(source: SourceEntity): FormState {
  return {
    sourceId: source.sourceId,
    name: source.name,
    baseUrl: source.baseUrl,
    role: source.role,
    trustWeight: source.trustWeight,
    gameKeys: source.gameKeys,
    isEnabled: source.isEnabled,
    providerId: source.providerId,
    parserVersion: source.parserVersion,
    requiresRender: source.requiresRender,
    minIntervalMs: source.minIntervalMs,
  };
}

/**
 * Dialog sửa 1 nguồn — đổi `role`/`isEnabled` ảnh hưởng trực tiếp consensus nên LUÔN bắt
 * xác nhận qua `AlertDialog` phụ trước khi gọi mutation thật (`07-admin-management-page
 * .plan.md §8`), kể cả khi form không đổi gì (đơn giản hoá — không cần diff phức tạp).
 */
export function SourceEditDialog({ source, onClose }: SourceEditDialogProps) {
  const [form, setForm] = useState<FormState | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const updateMutation = useUpdateSource();

  useEffect(() => {
    setForm(source ? toFormState(source) : null);
    setShowConfirm(false);
  }, [source]);

  const isOpen = !!source && !!form;

  function handleSave() {
    if (!form) {
      return;
    }
    updateMutation.mutate(form, {
      onSuccess: () => {
        setShowConfirm(false);
        onClose();
      },
    });
  }

  function toggleGameKey(key: ResultFeedGameKey) {
    if (!form) {
      return;
    }
    const has = form.gameKeys.includes(key);
    setForm({
      ...form,
      gameKeys: has ? form.gameKeys.filter((k) => k !== key) : [...form.gameKeys, key],
    });
  }

  return (
    <>
      <Dialog open={isOpen && !showConfirm} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          {form && (
            <>
              <DialogHeader>
                <DialogTitle>Sửa nguồn — {form.name}</DialogTitle>
                <DialogDescription className="font-mono text-xs">{source?.sourceId}</DialogDescription>
              </DialogHeader>

              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="src-name">Tên hiển thị</Label>
                  <Input id="src-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="src-baseurl">Base URL</Label>
                  <Input
                    id="src-baseurl"
                    value={form.baseUrl}
                    onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label>Vai trò</Label>
                    <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as SourceRole })}>
                      <SelectTrigger size="sm" className="text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.values(SourceRole).map((r) => (
                          <SelectItem key={r} value={r}>
                            {SOURCE_ROLE_LABELS[r]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="src-trust">Trust weight (0–100)</Label>
                    <Input
                      id="src-trust"
                      type="number"
                      min={0}
                      max={100}
                      value={form.trustWeight}
                      onChange={(e) => setForm({ ...form, trustWeight: Number(e.target.value) })}
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label>Game phục vụ</Label>
                  <div className="flex flex-wrap gap-3">
                    {Object.values(ResultFeedGameKey).map((key) => (
                      <div key={key} className="flex items-center gap-1.5">
                        <Checkbox
                          id={`gk-${key}`}
                          checked={form.gameKeys.includes(key)}
                          onCheckedChange={() => toggleGameKey(key)}
                        />
                        <Label htmlFor={`gk-${key}`} className="font-normal text-xs">
                          {RESULTFEED_GAME_LABELS[key]}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label>Provider</Label>
                    <Select
                      value={form.providerId}
                      onValueChange={(v) => setForm({ ...form, providerId: v as ResultFeedProviderId })}
                    >
                      <SelectTrigger size="sm" className="text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.values(ResultFeedProviderId).map((p) => (
                          <SelectItem key={p} value={p}>
                            {PROVIDER_ID_LABELS[p]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="src-parser">Parser version</Label>
                    <Input
                      id="src-parser"
                      value={form.parserVersion}
                      onChange={(e) => setForm({ ...form, parserVersion: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="src-interval">Min interval (ms)</Label>
                    <Input
                      id="src-interval"
                      type="number"
                      min={0}
                      value={form.minIntervalMs}
                      onChange={(e) => setForm({ ...form, minIntervalMs: Number(e.target.value) })}
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label>Yêu cầu render JS</Label>
                    <div className="flex h-9 items-center">
                      <Switch
                        checked={form.requiresRender}
                        onCheckedChange={(v) => setForm({ ...form, requiresRender: v })}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-md border p-3">
                  <div className="flex flex-col">
                    <Label>Kích hoạt nguồn</Label>
                    <span className="text-muted-foreground text-xs">Tắt ⇒ worker bỏ qua, consensus không tính.</span>
                  </div>
                  <Switch checked={form.isEnabled} onCheckedChange={(v) => setForm({ ...form, isEnabled: v })} />
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={onClose}>
                  Huỷ
                </Button>
                <Button onClick={() => setShowConfirm(true)}>Lưu</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={showConfirm} onOpenChange={(open) => !open && setShowConfirm(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-full bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-sm">
                <AlertTriangle className="size-5" />
              </div>
              <AlertDialogTitle className="font-semibold text-base">Xác nhận thay đổi cấu hình nguồn?</AlertDialogTitle>
            </div>
            <AlertDialogDescription className="pt-1">
              Đổi vai trò/trạng thái nguồn ảnh hưởng trực tiếp tới việc chốt kết quả. Kiểm tra kỹ trước khi lưu.
              {form && (
                <span className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline">{SOURCE_ROLE_LABELS[form.role]}</Badge>
                  <Badge variant={form.isEnabled ? "secondary" : "destructive"}>
                    {form.isEnabled ? "Đang kích hoạt" : "Đã tắt"}
                  </Badge>
                  <Badge variant="outline">trust {form.trustWeight}</Badge>
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={updateMutation.isPending} onClick={() => setShowConfirm(false)}>
              Quay lại
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleSave();
              }}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? "Đang lưu…" : "Xác nhận & lưu"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
