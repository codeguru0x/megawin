"use client";

import { type ComponentPropsWithoutRef, type ReactNode, useState } from "react";

import Link from "next/link";

import { Check, Copy } from "lucide-react";
import type { Route } from "next";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

import { slugify } from "./markdown";

/** Lấy text thuần từ children React (để slugify heading + copy code). */
function toText(node: ReactNode): string {
  if (node == null || node === false || node === true) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(toText).join("");
  if (typeof node === "object" && "props" in node) {
    return toText((node as { props: { children?: ReactNode } }).props.children);
  }
  return "";
}

/**
 * Rewrite link nội bộ giữa các doc:
 * - `./type-b1.md`, `type-a.md` (cùng game) -> `/guides/{game}/{topic}/{slug}`.
 * - `../README.md` hay link sang `_developer` -> giữ nguyên text, bỏ href ngoài.
 *
 * @param href - href thô trong Markdown.
 * @param basePath - Route hiện tại `/guides/{game}/{topic}` để resolve link tương đối.
 * @returns href đã rewrite, hoặc `null` nếu nên render như text (không điều hướng được).
 */
function rewriteHref(href: string, basePath: string): string | null {
  // Link ngoài hoặc anchor: giữ nguyên.
  if (/^(https?:)?\/\//.test(href) || href.startsWith("#") || href.startsWith("mailto:")) {
    return href;
  }
  if (!href.endsWith(".md")) return href;

  // Link tới bản developer không hiển thị trong backoffice → render như text.
  if (href.includes("_developer") || href.includes("README")) return null;

  // Tách tên file `xxx.md` ở cùng thư mục → slug = xxx.
  const fileName = href.split("/").pop() ?? "";
  const slug = fileName.replace(/\.md$/, "");
  if (!slug) return null;
  return `${basePath}/${slug}`;
}

/** Nút copy cho code block. */
function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="text-muted-foreground hover:text-foreground absolute top-2 right-2 inline-flex size-7 items-center justify-center rounded-md border bg-background/80 backdrop-blur transition-colors"
      aria-label="Sao chép"
    >
      {copied ? <Check className="size-3.5 text-green-600" /> : <Copy className="size-3.5" />}
    </button>
  );
}

/** Heading có `id` slug + anchor link khi hover. */
function heading(level: 1 | 2 | 3) {
  const Tag = `h${level}` as const;
  const sizeClass =
    level === 1
      ? "scroll-mt-20 text-2xl font-semibold tracking-tight mb-4"
      : level === 2
        ? "scroll-mt-20 text-xl font-semibold tracking-tight mt-8 mb-3 border-b pb-1.5"
        : "scroll-mt-20 text-base font-semibold mt-6 mb-2";

  return function Heading({ children }: ComponentPropsWithoutRef<typeof Tag>) {
    const id = slugify(toText(children));
    return (
      <Tag id={id} className={cn("group scroll-mt-20", sizeClass)}>
        <a href={`#${id}`} className="no-underline">
          {children}
        </a>
      </Tag>
    );
  };
}

/**
 * Map blockquote -> Alert. Variant `destructive` nếu mở đầu bằng "Cảnh báo".
 */
function blockquote({ children }: { children?: ReactNode }) {
  const text = toText(children);
  const isWarning = /^\s*(cảnh báo|warning|nguy hiểm)/i.test(text);
  return (
    <Alert variant={isWarning ? "destructive" : "default"} className="my-4">
      <AlertDescription className="[&_p]:my-0">{children}</AlertDescription>
    </Alert>
  );
}

/**
 * Renderer Markdown nhẹ (client) cho bản staff: `react-markdown` + `remark-gfm`
 * map sang shadcn (Table/Alert) + code block có nút copy + heading có anchor.
 *
 * KHÔNG hỗ trợ mermaid — bản staff không có diagram.
 *
 * @param content - Markdown thô của doc.
 * @param basePath - Route `/guides/{game}/{topic}` để rewrite link `.md` nội bộ.
 */
export function MarkdownRenderer({ content, basePath }: { content: string; basePath: string }) {
  const components: Components = {
    h1: heading(1),
    h2: heading(2),
    h3: heading(3),
    p: ({ children }) => <p className="my-3 leading-7">{children}</p>,
    ul: ({ children }) => <ul className="my-3 ml-6 list-disc space-y-1.5">{children}</ul>,
    ol: ({ children }) => <ol className="my-3 ml-6 list-decimal space-y-1.5">{children}</ol>,
    li: ({ children }) => <li className="leading-7">{children}</li>,
    strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
    hr: () => <hr className="my-6" />,
    blockquote,
    a: ({ href, children }) => {
      if (!href) return <>{children}</>;
      const resolved = rewriteHref(href, basePath);
      if (resolved === null) return <span className="font-medium">{children}</span>;
      const isExternal = /^(https?:)?\/\//.test(resolved);
      if (isExternal) {
        return (
          <a
            href={resolved}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary font-medium underline underline-offset-4"
          >
            {children}
          </a>
        );
      }
      return (
        <Link prefetch={false} href={resolved as Route} className="text-primary font-medium underline underline-offset-4">
          {children}
        </Link>
      );
    },
    table: ({ children }) => (
      <div className="my-4 overflow-hidden rounded-lg border">
        <Table>{children}</Table>
      </div>
    ),
    thead: ({ children }) => <TableHeader>{children}</TableHeader>,
    tbody: ({ children }) => <TableBody>{children}</TableBody>,
    tr: ({ children }) => <TableRow>{children}</TableRow>,
    th: ({ children }) => <TableHead className="whitespace-normal">{children}</TableHead>,
    td: ({ children }) => <TableCell className="whitespace-normal">{children}</TableCell>,
    code: ({ className, children }) => {
      const isBlock = className?.includes("language-");
      if (!isBlock) {
        return <code className="bg-muted rounded px-1.5 py-0.5 font-mono text-[0.85em]">{children}</code>;
      }
      return <code className={className}>{children}</code>;
    },
    pre: ({ children }) => {
      const value = toText(children);
      return (
        <div className="relative my-4">
          <pre className="bg-muted overflow-x-auto rounded-lg border p-4 text-sm [&_code]:bg-transparent [&_code]:p-0">
            {children}
          </pre>
          <CopyButton value={value} />
        </div>
      );
    },
  };

  return (
    <div className="text-foreground">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
