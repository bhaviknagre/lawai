"use client";
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="card mx-auto mt-10 flex max-w-lg flex-col gap-3 p-6">
      <h1 className="h2">This page couldn't load</h1>
      <p className="text-muted">{error.message || "An unexpected error occurred."}</p>
      <button className="btn btn-primary self-start" onClick={reset}>Try again</button>
    </div>
  );
}
