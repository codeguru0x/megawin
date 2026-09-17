export default function Loading() {
  return (
    <div className="flex flex-col gap-4">
      <div className="bg-muted h-10 w-64 animate-pulse rounded-md" />
      <div className="bg-muted h-90 animate-pulse rounded-lg" />
    </div>
  );
}
