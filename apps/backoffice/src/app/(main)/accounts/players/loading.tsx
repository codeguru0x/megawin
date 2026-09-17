export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      {/* PageHeader skeleton */}
      <div>
        <div className="flex items-center gap-3">
          <div className="bg-muted size-9 animate-pulse rounded-xl" />
          <div className="space-y-1.5">
            <div className="bg-muted h-5 w-44 animate-pulse rounded" />
            <div className="bg-muted h-3 w-72 animate-pulse rounded" />
          </div>
        </div>
      </div>
      {/* Card skeleton — tenant selector nằm trong CardHeader */}
      <div className="bg-card rounded-xl border">
        <div className="flex items-center justify-between gap-2 px-5 pt-3 pb-2">
          <div className="flex items-center gap-2">
            <div className="bg-muted size-4 animate-pulse rounded" />
            <div className="bg-muted h-4 w-20 animate-pulse rounded" />
            {/* Tenant selector inline */}
            <div className="bg-muted h-7 w-40 animate-pulse rounded-md" />
          </div>
          {/* Search icon */}
          <div className="bg-muted size-7 animate-pulse rounded" />
        </div>
        <div className="px-0 pt-0 pb-0">
          <div className="bg-muted h-80 animate-pulse" />
        </div>
      </div>
    </div>
  );
}
