import Link from "next/link";

import { RUNBOOK_MANIFEST } from "@megawin/ops-docs/manifest";
import { ArrowRight, BookOpen, Sparkles } from "lucide-react";
import type { Metadata } from "next";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { getGameMeta } from "./_lib/game-meta";

export const metadata: Metadata = {
  title: "Hướng dẫn sử dụng",
  description: "Tài liệu vận hành dành cho nhân viên: kết sổ lại, xử lý kỳ quay.",
};

export default function GuidesLandingPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 md:px-8 md:py-12">
      <header className="mb-10">
        <div className="text-muted-foreground mb-3 flex items-center gap-2 text-sm">
          <BookOpen className="size-4" />
          <span>Trung tâm hướng dẫn</span>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Hướng dẫn sử dụng</h1>
        <p className="text-muted-foreground mt-3 max-w-2xl text-base">
          Tài liệu vận hành dành cho nhân viên — các bước thao tác rõ ràng, không thuật ngữ kỹ thuật. Chọn game để xem
          hướng dẫn chi tiết.
        </p>
      </header>

      <section className="mb-10">
        <div className="mb-4 flex items-center gap-2">
          <Sparkles className="text-primary size-4" />
          <h2 className="text-sm font-medium tracking-wide uppercase">Bắt đầu nhanh</h2>
        </div>
        <Card className="bg-muted/30">
          <CardContent className="flex flex-col gap-3 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium">Kết sổ lại kỳ quay (Resettle)</p>
              <p className="text-muted-foreground text-sm">
                Quy trình sửa kết quả kỳ đã công bố. Bắt đầu với Type A — trường hợp đơn giản nhất.
              </p>
            </div>
            <Link
              href="/guides/power655/resettle/type-a"
              className="text-primary inline-flex shrink-0 items-center gap-1 text-sm font-medium hover:underline"
            >
              Xem hướng dẫn
              <ArrowRight className="size-4" />
            </Link>
          </CardContent>
        </Card>
      </section>

      <section>
        <h2 className="mb-4 text-sm font-medium tracking-wide uppercase">Theo game</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {RUNBOOK_MANIFEST.map((game) => {
            const meta = getGameMeta(game.gameKey);
            const Icon = meta.icon;
            const firstTopic = game.topics[0];
            const firstDoc = firstTopic?.docs[0];
            const docCount = game.topics.reduce((sum, t) => sum + t.docs.length, 0);

            return (
              <Link
                key={game.gameKey}
                href={firstTopic && firstDoc ? `/guides/${game.gameKey}/${firstTopic.key}/${firstDoc.slug}` : "/guides"}
                className="group"
              >
                <Card className={cn("h-full border-l-4 transition-colors hover:shadow-sm", meta.border)}>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <span className={cn("flex size-9 items-center justify-center rounded-md", meta.bgMuted)}>
                        <Icon className={cn("size-5", meta.text)} />
                      </span>
                      <CardTitle className="text-base">{game.title}</CardTitle>
                    </div>
                    <CardDescription className="mt-1">{game.topics.map((t) => t.title).join(", ")}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <Badge variant="secondary">{docCount} hướng dẫn</Badge>
                      <span className="text-muted-foreground group-hover:text-foreground inline-flex items-center gap-1 text-sm transition-colors">
                        Xem
                        <ArrowRight className="size-3.5" />
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
