import { KeyRound, Send, UserPlus } from "lucide-react";
import type { SessionUser } from "@/lib/auth";
import { getTeam } from "@/lib/queries/common";
import { ROLES, ROLE_LABELS } from "@/lib/accounts";
import { inviteTeamMember, resendInvite, resetMemberPassword, setMemberActive, setMemberRole } from "@/app/actions/team";
import { ConfirmButton } from "@/components/forms";
import { InviteForm, LinkButton } from "@/components/invite-link";
import { Avatar, Field, Pill } from "@/components/ui";

const ROLE_HELP = "Admins see every matter and manage the team and firm settings. Associates open matters, staff them and finalise documents. Paralegals work on the matters they're staffed on; they can't open or close matters, change teams, finalise or delete documents, or see Reports.";

/** Admin-only: invite associates and paralegals, change roles, resend invites, reset passwords, deactivate leavers. */
export async function TeamSettings({ user }: { user: SessionUser }) {
  const team = await getTeam(user.firmId);
  return (
    <section className="card p-5 xl:col-span-2">
      <h2 className="h2">Team</h2>
      <p className="mb-3 text-[13.5px] text-muted">{ROLE_HELP}</p>
      <ul className="flex flex-col">
        {team.map((p) => {
          const self = p.id === user.id;
          const inactive = !!p.deactivatedAt;
          const invited = !p.activatedAt;
          return (
            <li key={p.id} className={`flex flex-wrap items-center gap-3 border-t border-line py-3 ${inactive ? "opacity-60" : ""}`}>
              <Avatar name={p.name} color={p.color} size={32} />
              <div className="min-w-[200px] flex-1">
                <div className="font-semibold">{p.name} <span className="font-normal text-muted">· {p.title}</span></div>
                <div className="text-[13px] text-muted">{p.email}</div>
              </div>
              {inactive && <Pill tone="bad">Deactivated</Pill>}
              {!inactive && invited && <Pill tone="mid">Invite pending</Pill>}
              {self ? (
                <Pill>{ROLE_LABELS[p.role]} · you</Pill>
              ) : (
                <div className="flex flex-wrap items-start gap-2">
                  {!inactive && (
                    <form action={setMemberRole.bind(null, p.id)} className="flex gap-2">
                      <label className="sr-only" htmlFor={`role-${p.id}`}>Role for {p.name}</label>
                      <select id={`role-${p.id}`} name="role" defaultValue={p.role} className="input h-10 w-auto">
                        {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                      </select>
                      <button className="btn btn-secondary">Save role</button>
                    </form>
                  )}
                  {!inactive && invited && (
                    <LinkButton action={resendInvite.bind(null, p.id)} label="New invite link" icon={<Send size={15} />} confirmText={`Create a new invite link for ${p.name}? Their previous link will stop working.`} />
                  )}
                  {!inactive && !invited && (
                    <LinkButton action={resetMemberPassword.bind(null, p.id)} label="Reset password" icon={<KeyRound size={15} />} confirmText={`Reset ${p.name}'s password? Their current password stops working and they're signed out everywhere.`} />
                  )}
                  <ConfirmButton
                    onConfirm={setMemberActive.bind(null, p.id, inactive)}
                    message={inactive ? `Reactivate ${p.name}? They'll be able to sign in again.` : `Deactivate ${p.name}? They'll be signed out and can't sign in. Their work stays in LawAI.`}
                    className={inactive ? "btn btn-secondary" : "btn btn-secondary text-bad"}
                  >
                    {inactive ? "Reactivate" : "Deactivate"}
                  </ConfirmButton>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <details className="mt-2 border-t border-line pt-3">
        <summary className="link inline-flex cursor-pointer items-center gap-1.5 text-[14px]"><UserPlus size={15} /> Invite a person</summary>
        <div className="mt-3">
          <InviteForm action={inviteTeamMember} submitLabel="Create invite">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Full name"><input className="input" name="name" required /></Field>
              <Field label="Work email"><input className="input" name="email" type="email" required /></Field>
              <Field label="Role">
                <select className="input" name="role" defaultValue="attorney">
                  {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                </select>
              </Field>
              <Field label="Job title" hint="Optional, e.g. Senior Associate"><input className="input" name="title" /></Field>
            </div>
          </InviteForm>
        </div>
      </details>
    </section>
  );
}
