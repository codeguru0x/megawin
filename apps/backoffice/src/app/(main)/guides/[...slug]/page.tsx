import type { Metadata } from "next";

import Link from "next/link";
import { notFound } from "next/navigation";

import { findRunbookDoc, RUNBOOK_MANIFEST } from "@megawin/ops-docs/manifest";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

import { DocMeta } from "../_lib/components/doc-meta";
import { DocPager } from "../_lib/components/doc-pager";
import { TableOfContents } from "../_lib/components/table-of-contents";
import { DOC_CONTENT } from "../_lib/docs-content";
import { MarkdownRenderer } from "../_lib/markdown-renderer";
import { extractToc, readingTimeMinutes } from "../_lib/markdown";
import { getAdjacentDocs } from "../_lib/navigation";

interface PageProps {
  params: Promise<{ slug: string[] }>;
}

/** Prerender mọi doc staff trong manifest. */
export function generateStaticParams() {
  const params: { slug: string[] }[] = [];
  for (const game of RUNBOOK_MANIFEST) {
    for (const topic of game.topics) {
      for (const doc of topic.docs) {
        params.push({ slug: [game.gameKey, topic.key, doc.slug] });
      }
    }
  }
  return params;
}

function resolveDoc(slug: string[]) {
  if (slug.length !== 3) return null;
  const [gameKey, topicKey, docSlug] = slug as [string, string, string];
  const found = findRunbookDoc(gameKey, topicKey, docSlug);
  if (!found) return null;
  const content = DOC_CONTENT[found.doc.file];
  if (content == null) return null;
  return { ...found, content, gameKey, topicKey, docSlug };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const resolved = resolveDoc(slug);
  if (!resolved) return { title: "Không tìm thấy hướng dẫn" };
  return {
    title: `${resolved.doc.title} — ${resolved.game.title}`,
    description: resolved.doc.description,
  };
}

export default async function GuideDocPage({ params }: PageProps) {
  const { slug } = await params;
  const resolved = resolveDoc(slug);
  if (!resolved) notFound();

  const { game, topic, doc, content, gameKey, topicKey, docSlug } = resolved;
  const toc = extractToc(content);
  const minutes = readingTimeMinutes(content);
  const { prev, next } = getAdjacentDocs(gameKey, topicKey, docSlug);
  const basePath = `/guides/${gameKey}/${topicKey}`;

  return (
    <div className="mx-auto flex w-full max-w-6xl gap-10 px-4 py-8 md:px-8 md:py-10">
      <article className="w-full min-w-0 max-w-[72ch] flex-1">
        <Breadcrumb className="mb-4">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/guides">Hướng dẫn</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>{game.title}</BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>{topic.title}</BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{doc.title}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <DocMeta
          gameKey={gameKey}
          gameTitle={game.title}
          topicTitle={topic.title}
          minutes={minutes}
        />

        <div className="mt-6">
          <MarkdownRenderer content={content} basePath={basePath} />
        </div>

        <DocPager prev={prev} next={next} />
      </article>

      <aside className="hidden w-[220px] shrink-0 xl:block">
        <div className="sticky top-10">
          <TableOfContents items={toc} />
        </div>
      </aside>
    </div>
  );
}
