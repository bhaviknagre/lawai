import Link from "next/link";
export default function NotFound() {
  return (
    <div className="card mx-auto mt-10 flex max-w-lg flex-col gap-3 p-6">
      <h1 className="h2">Not found, or you don't have access</h1>
      <p className="text-muted">Matters are visible only to the people staffed on them. Ask an admin to add you to the team.</p>
      <Link href="/" className="btn btn-secondary self-start">Back to dashboard</Link>
    </div>
  );
}
