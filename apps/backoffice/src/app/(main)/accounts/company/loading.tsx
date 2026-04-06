export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      {/* PageHeader skeleton */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="size-9 animate-pulse rounded-xl bg-muted" />
          <div className="space-y-1.5">
            <div className="h-5 w-36 animate-pulse rounded bg-muted" />
            <div className="h-3 w-56 animate-pulse rounded bg-muted" />
          </div>
        </div>
        <div className="h-9 w-36 animate-pulse rounded-md bg-muted" />
      </div>
      {/* Card skeleton */}
      <div className="rounded-xl border bg-card">
        <div className="flex items-center gap-2 px-5 pb-2 pt-4">
          <div className="size-4 animate-pulse rounded bg-muted" />
          <div className="h-4 w-40 animate-pulse rounded bg-muted" />
        </div>
        <div className="px-0 pb-0 pt-0">
          <div className="h-[320px] animate-pulse bg-muted" />
        </div>
      </div>
    </div>
  );
}
