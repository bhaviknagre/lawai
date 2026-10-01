export default function Loading() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading">
      <div className="h-9 w-64 animate-pulse rounded-lg bg-line" />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(230px,1fr))] gap-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="card h-36 animate-pulse bg-sunken" />)}
      </div>
      <div className="card h-80 animate-pulse bg-sunken" />
    </div>
  );
}
