import { and, asc, eq } from "drizzle-orm";
import { Trash2 } from "lucide-react";
import { db } from "@/db";
import { firms, playbookRules } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getFirmUsers, getJurisdictions } from "@/lib/queries/common";
import { aiStatus } from "@/lib/ai-service";
import { storageLabel } from "@/lib/storage";
import { ROLE_LABELS } from "@/lib/accounts";
import { ActionForm } from "@/components/forms";
import { Avatar, Field, PageHeader, Pill } from "@/components/ui";
import { updateFirm, updateProfile } from "@/app/actions/settings";
import { addPlaybookRule, deletePlaybookRule } from "@/app/actions/documents";
import { TeamSettings } from "./team";
import { can } from "@/lib/permissions";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser();
  const admin = can(user, "firm.settings");
  const editPlaybook = can(user, "playbook.edit");
  const [[firm], jur, rules, people, ai] = await Promise.all([
    db.select().from(firms).where(eq(firms.id, user.firmId)),
    getJurisdictions(),
    db.select().from(playbookRules).where(eq(playbookRules.firmId, user.firmId)).orderBy(asc(playbookRules.documentKind), asc(playbookRules.title)),
    getFirmUsers(user.firmId),
    aiStatus(),
  ]);
  const me = people.find((p) => p.id === user.id)!;
  return (
    <>
      <PageHeader title="Settings" sub={admin ? "Your profile, firm settings and review playbook" : "Your profile"} />
      <div className="grid gap-4 xl:grid-cols-2">
        <section className="card p-5">
          <h2 className="h2 mb-4">Profile</h2>
          <ActionForm action={updateProfile} submitLabel="Save profile" resetOnSuccess={false} successText="Saved.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name"><input className="input" name="name" defaultValue={user.name} /></Field>
              <Field label="Title"><input className="input" name="title" defaultValue={user.title} /></Field>
              <Field label="Weekly billable target (h)"><input className="input" type="number" name="weeklyTargetHours" defaultValue={me.weeklyTargetHours} /></Field>
              <Field label="New password" hint="Leave blank to keep the current one"><input className="input" type="password" name="password" autoComplete="new-password" /></Field>
            </div>
          </ActionForm>
        </section>

        <section className="card p-5">
          <h2 className="h2 mb-3">System status</h2>
          <ul className="flex flex-col gap-2.5 text-[14px]">
            <li className="flex justify-between"><span>AI service (Python)</span>{ai.reachable ? <Pill tone="good">Running</Pill> : <Pill tone="bad">Not reachable · npm run ai:dev</Pill>}</li>
            <li className="flex justify-between"><span>LLM (chat, review, drafting)</span>{ai.ai ? <Pill tone="good">{ai.provider === "groq" ? "Groq" : "Claude"} · {ai.models.chat}</Pill> : <Pill tone="bad">Add an LLM API key</Pill>}</li>
            <li className="flex justify-between"><span>Semantic search embeddings</span>{ai.embeddings !== "none" ? <Pill tone="good">{ai.embeddings}</Pill> : <Pill tone="mid">Keyword only · add VOYAGE_API_KEY</Pill>}</li>
            <li className="flex justify-between"><span>Contextual retrieval</span>{ai.contextual ? <Pill tone="good">On · {ai.models.fast}</Pill> : <Pill tone="neutral">Off</Pill>}</li>
            <li className="flex justify-between"><span>File storage</span><Pill>{storageLabel()}</Pill></li>
          </ul>
          {!can(user, "team.manage") && (
            <>
              <h3 className="mt-5 font-semibold">Team</h3>
              <ul className="mt-2 flex flex-col gap-2">
                {people.map((p) => <li key={p.id} className="flex items-center gap-2.5 text-[14px]"><Avatar name={p.name} color={p.color} size={28} />{p.name}<span className="text-muted">· {p.title}</span><Pill className="ml-auto">{ROLE_LABELS[p.role]}</Pill></li>)}
              </ul>
            </>
          )}
        </section>

        {can(user, "team.manage") && <TeamSettings user={user} />}

        {admin && firm && (
          <section className="card p-5">
            <h2 className="h2 mb-4">Firm</h2>
            <ActionForm action={updateFirm} submitLabel="Save firm settings" resetOnSuccess={false} successText="Saved.">
              <Field label="Firm name"><input className="input" name="name" defaultValue={firm.name} /></Field>
              <fieldset>
                <legend className="mb-2 text-[13px] font-semibold">Jurisdictions you practise in</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {jur.map((j) => <label key={j.code} className="flex items-center gap-2 text-[14px]"><input type="checkbox" name="jurisdictions" value={j.code} defaultChecked={firm.jurisdictions.includes(j.code)} className="h-4 w-4 accent-[#2b44d6]" />{j.name}</label>)}
                </div>
              </fieldset>
              <fieldset>
                <legend className="mb-2 text-[13px] font-semibold">Minutes saved per AI action (for the ROI estimate on Reports)</legend>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {(["chat", "review", "draft", "research"] as const).map((k) => (
                    <Field key={k} label={k[0]!.toUpperCase() + k.slice(1)}><input className="input" type="number" min={0} name={`min_${k}`} defaultValue={firm.aiMinutesSaved[k] ?? 0} /></Field>
                  ))}
                </div>
              </fieldset>
            </ActionForm>
          </section>
        )}

        <section className="card p-5">
          <h2 className="h2">Review playbook</h2>
          <p className="mb-3 text-[13.5px] text-muted">AI review checks each document against the rules for its type.</p>
          <ul className="flex flex-col">
            {rules.map((r) => (
              <li key={r.id} className="flex items-start gap-3 border-t border-line py-3">
                <Pill tone={r.severity === "high" ? "bad" : r.severity === "medium" ? "mid" : "neutral"} className="capitalize">{r.severity}</Pill>
                <div className="min-w-0 flex-1"><div className="font-semibold">{r.title} <span className="font-normal text-muted">· {r.documentKind}</span></div><div className="text-[13.5px] text-muted">{r.rule}</div></div>
                {editPlaybook && <form action={deletePlaybookRule.bind(null, r.id)}><button aria-label={`Delete rule ${r.title}`} className="flex h-9 w-9 items-center justify-center rounded-lg text-subtle hover:bg-bad-soft hover:text-bad"><Trash2 size={15} /></button></form>}
              </li>
            ))}
          </ul>
          {editPlaybook && (
            <details className="mt-2 border-t border-line pt-3">
              <summary className="link cursor-pointer text-[14px]">Add a rule</summary>
              <div className="mt-3">
                <ActionForm action={addPlaybookRule} submitLabel="Add rule" successText="Rule added.">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Field label="Title"><input className="input" name="title" required /></Field>
                    <Field label="Document type"><input className="input" name="documentKind" defaultValue="Contract" /></Field>
                    <Field label="Severity"><select className="input" name="severity" defaultValue="medium"><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></Field>
                  </div>
                  <Field label="Rule"><textarea className="input" name="rule" rows={2} required placeholder="e.g. Payment terms must be 30 days or less." /></Field>
                  <input type="hidden" name="playbook" value="Firm playbook" />
                </ActionForm>
              </div>
            </details>
          )}
        </section>
      </div>
    </>
  );
}
