"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Copy, Dices, Eye, EyeOff } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { generatePassword } from "./generate-password";

interface SetPasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  username: string;
}

export function SetPasswordDialog({
  open,
  onOpenChange,
  username,
}: SetPasswordDialogProps) {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [success, setSuccess] = useState(false);
  const [copied, setCopied] = useState(false);

  const mutation = useMutation({
    mutationFn: (values: { username: string; password: string }) =>
      apiClient.post("/accounts/set-password", values),
    onSuccess: () => {
      setSuccess(true);
    },
    onError: (error) => {
      if (error instanceof ApiClientError) {
        toast.error(error.message);
      } else {
        toast.error("Đặt mật khẩu thất bại.");
      }
    },
  });

  function handleGenerate() {
    setPassword(generatePassword(8));
    setShowPassword(true);
  }

  function handleSubmit() {
    if (password.length < 8) {
      toast.error("Mật khẩu tối thiểu 8 ký tự.");
      return;
    }
    mutation.mutate({ username, password });
  }

  async function handleCopy() {
    const message = `Tài khoản: ${username}\nMật khẩu mới: ${password}\n\nVui lòng đăng nhập và đổi mật khẩu ngay.`;
    await navigator.clipboard.writeText(message);
    setCopied(true);
    toast.success("Đã sao chép thông tin.");
    setTimeout(() => setCopied(false), 2000);
  }

  function handleClose(value: boolean) {
    if (!value) {
      setPassword("");
      setShowPassword(false);
      setSuccess(false);
      setCopied(false);
      mutation.reset();
    }
    onOpenChange(value);
  }

  if (success) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Đặt mật khẩu thành công</DialogTitle>
            <DialogDescription>
              Mật khẩu mới đã được đặt. Người dùng sẽ phải đổi mật khẩu khi
              đăng nhập lần tới.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 rounded-lg border bg-muted/50 p-4">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-sm">Tài khoản</span>
              <span className="font-mono font-medium text-sm">{username}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-sm">Mật khẩu mới</span>
              <span className="font-mono font-medium text-sm">{password}</span>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => handleClose(false)}>
              Đóng
            </Button>
            <Button onClick={handleCopy}>
              {copied ? (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Đã sao chép
                </>
              ) : (
                <>
                  <Copy className="mr-2 h-4 w-4" />
                  Sao chép thông tin
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Đặt mật khẩu mới</DialogTitle>
          <DialogDescription>
            Đặt mật khẩu mới cho tài khoản{" "}
            <span className="font-semibold">{username}</span>. Mật khẩu sẽ là
            tạm thời, người dùng phải đổi khi đăng nhập.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Label htmlFor="new-password">Mật khẩu mới</Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                id="new-password"
                type={showPassword ? "text" : "password"}
                placeholder="Tối thiểu 8 ký tự"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                className="pr-10"
              />
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
        </div>

        <DialogFooter className="mt-2">
          <Button
            variant="outline"
            onClick={() => handleClose(false)}
            disabled={mutation.isPending}
          >
            Huỷ
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={mutation.isPending || password.length < 8}
          >
            {mutation.isPending ? "Đang xử lý..." : "Xác nhận"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
