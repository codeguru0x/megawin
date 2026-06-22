"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

import type { TocItem } from "../markdown";

/**
 * Mục lục bên phải với scroll-spy: highlight heading đang hiển thị trong viewport.
 *
 * Dùng `IntersectionObserver` theo dõi mọi heading có `id` khớp `items`.
 * Click cuộn mượt tới heading.
 *
 * @param items - Danh sách heading (từ `extractToc`), `id` khớp với `id` heading render.
 */
export function TableOfContents({ items }: { items: TocItem[] }) {
  const [activeId, setActiveId] = useState<string>("");

  useEffect(() => {
    if (items.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible[0]) {
          setActiveId(visible[0].target.id);
        }
      },
      { rootMargin: "0px 0px -70% 0px", threshold: 0 },
    );

    for (const item of items) {
      const el = document.getElementById(item.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [items]);

  if (items.length === 0) return null;

  return (
    <div>
      <p className="text-muted-foreground mb-3 text-xs font-medium tracking-wide uppercase">
        Trên trang này
      </p>
      <ul className="space-y-1 text-sm">
        {items.map((item) => (
          <li key={item.id} style={{ paddingLeft: (item.level - 2) * 12 }}>
            <a
              href={`#${item.id}`}
              className={cn(
                "block py-0.5 transition-colors",
                activeId === item.id
                  ? "text-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {item.text}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
