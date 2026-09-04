"use client";

/**
 * Error boundary riêng cho route `/ai` (mục 7 phân tích loop, 2026-09).
 *
 * Thiếu file này thì lỗi render trong `AiWorkspace`/`ChatPanel` leo thẳng lên boundary CHA
 * (`app/(main)/error.tsx` nếu có, hoặc root) — mất luôn `AppSidebar`/header, staff nhìn thấy
 * trang lỗi trắng không còn điều hướng. `error.js` (Next.js 16) chỉ bọc segment `/ai` và con của
 * nó, KHÔNG bọc `layout.tsx` phía trên — nên `AppSidebar`/header trong `(main)/layout.tsx` vẫn
 * sống nguyên khi nhánh `/ai` crash.
 *
 * Giữ SHELL TỐI THIỂU (không cần khớp layout đầy đủ như `loading.tsx`) — đây là trạng thái lỗi,
 * không phải trạng thái tải, không cần đánh lừa mắt bằng skeleton khớp pixel.
 */

import { useEffect } from "react";

import { AlertTriangle, RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AI_ASSISTANT_NAME } from "@/config/app-config";

export default function AiError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error("[ai] Lỗi render trang chat:", error);
  }, [error]);

  return (
    <div className="flex h-[calc(100svh-3rem-1rem)] min-h-0 flex-col items-center justify-center gap-3 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10">
        <AlertTriangle className="size-6 text-destructive" />
      </div>
      <div className="space-y-1">
        <p className="font-medium text-foreground text-sm">{AI_ASSISTANT_NAME} gặp lỗi khi tải trang chat</p>
        <p className="text-muted-foreground text-xs">Thử lại, hoặc quay lại sau nếu lỗi vẫn còn.</p>
      </div>
      <Button onClick={() => retry()} size="sm" variant="outline">
        <RotateCw className="size-3.5" />
        Thử lại
      </Button>
    </div>
  );
}
