import Link from "next/link";

import { ChevronLeft, ChevronRight } from "lucide-react";

import type { FlatDoc } from "../navigation";

/**
 * Điều hướng Prev/Next giữa các doc trong cùng topic (cuối bài).
 *
 * @param prev - Doc liền trước, hoặc `null` ở đầu topic.
 * @param next - Doc liền sau, hoặc `null` ở cuối topic.
 */
export function DocPager({ prev, next }: { prev: FlatDoc | null; next: FlatDoc | null }) {
  if (!prev && !next) return null;

  return (
    <nav className="mt-10 grid grid-cols-2 gap-4 border-t pt-6">
      {prev ? (
        <Link
          prefetch={false}
          href={prev.href}
          className="hover:bg-accent/50 group flex flex-col gap-1 rounded-lg border p-4 transition-colors"
        >
          <span className="text-muted-foreground flex items-center gap-1 text-xs">
            <ChevronLeft className="size-3" />
            Trước đó
          </span>
          <span className="group-hover:text-foreground text-sm font-medium">{prev.doc.title}</span>
        </Link>
      ) : (
        <span />
      )}
      {next ? (
        <Link
          prefetch={false}
          href={next.href}
          className="hover:bg-accent/50 group flex flex-col items-end gap-1 rounded-lg border p-4 text-right transition-colors"
        >
          <span className="text-muted-foreground flex items-center gap-1 text-xs">
            Tiếp theo
            <ChevronRight className="size-3" />
          </span>
          <span className="group-hover:text-foreground text-sm font-medium">{next.doc.title}</span>
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
