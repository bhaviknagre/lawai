import Link from "next/link";
import { findLink, LINK_TTL_HOURS } from "@/lib/accounts";
import { acceptInvite } from "@/app/actions/auth";
import { InviteForm } from "./form";

export const metadata = { title: "Set your password" };

/** Public page behind an invite or reset link. The link itself is the proof of identity. */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = await findLink(token);
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm">
        {found?.firm.suspendedAt ? (
          <>
            <h1 className="h1">Access paused</h1>
            <p className="mb-6 mt-2 text-muted">{found.firm.name}&apos;s LawAI access is paused. Please contact your firm&apos;s admin. This link will work again once access is restored, until it expires.</p>
          </>
        ) : found ? (
          <>
            <h1 className="h1">{found.token.purpose === "invite" ? `Welcome to LawAI, ${found.user.name.split(" ")[0]}` : "Choose a new password"}</h1>
            <p className="mb-6 mt-2 text-muted">
              {found.token.purpose === "invite"
                ? <>You've been invited to join your firm on LawAI as <strong>{found.user.email}</strong>. Choose a password to finish setting up your account.</>
                : <>Choose a new password for <strong>{found.user.email}</strong>.</>}
            </p>
            <InviteForm action={acceptInvite.bind(null, token)} />
          </>
        ) : (
          <>
            <h1 className="h1">This link no longer works</h1>
            <p className="mb-6 mt-2 text-muted">
              Links work once and expire after {LINK_TTL_HOURS} hours. Ask your firm's admin to send a new one.
            </p>
            <Link href="/login" className="btn btn-secondary">Go to sign in</Link>
          </>
        )}
      </div>
    </main>
  );
}
