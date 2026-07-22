export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      {/* PageHeader skeleton */}
      <div>
        <div className="flex items-center gap-3">
          <div className="size-9 animate-pulse rounded-xl bg-muted" />
          <div className="space-y-1.5">
            <div className="h-5 w-44 animate-pulse rounded bg-muted" />
            <div className="h-3 w-72 animate-pulse rounded bg-muted" />
          </div>
        </div>
      </div>
      {/* Card skeleton — tenant selector nằm trong CardHeader */}
      <div className="rounded-xl border bg-card">
        <div className="flex items-center justify-between gap-2 px-5 pb-2 pt-3">
          <div className="flex items-center gap-2">
            <div className="size-4 animate-pulse rounded bg-muted" />
            <div className="h-4 w-20 animate-pulse rounded bg-muted" />
            {/* Tenant selector inline */}
            <div className="h-7 w-40 animate-pulse rounded-md bg-muted" />
          </div>
          {/* Search icon */}
          <div className="size-7 animate-pulse rounded bg-muted" />
        </div>
        <div className="px-0 pb-0 pt-0">
          <div className="h-80 animate-pulse bg-muted" />
        </div>
      </div>
    </div>
  );
}
