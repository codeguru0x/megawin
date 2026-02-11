export default function Loading() {
  return (
    <div className="flex flex-col gap-4">
      <div className="h-10 w-64 animate-pulse rounded-md bg-muted" />
      <div className="h-[360px] animate-pulse rounded-lg bg-muted" />
    </div>
  );
}

