"use client";

import { Suspense } from "react";

import { Skeleton } from "@/components/ui/skeleton";

import { MyActivityContent } from "./_components/my-activity-content";

function MyActivityPageInner() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold tracking-tight text-foreground">Nhật ký của tôi</h2>
        <p className="text-xs text-muted-foreground">
          Nhật ký bảo mật tài khoản của bạn — đăng nhập, đăng xuất, đổi mật khẩu, xác thực 2 lớp. Lưu trữ 90 ngày.
        </p>
      </div>

      <MyActivityContent />
    </div>
  );
}

export default function MyActivityPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-4">
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      }
    >
      <MyActivityPageInner />
    </Suspense>
  );
}
