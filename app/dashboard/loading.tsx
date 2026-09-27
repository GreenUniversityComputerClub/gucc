export default function Loading() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-label="Loading">
      <div className="h-8 w-56 rounded bg-muted" />
      <div className="h-4 w-96 max-w-full rounded bg-muted" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-24 rounded-xl bg-muted" />)}
      </div>
      <div className="h-64 rounded-xl bg-muted" />
    </div>
  );
}
