import { Field } from "./ui";

/** Shared field sets for event / task dialogs. */
export function EventFields({ cases, caseId }: { cases?: { id: string; title: string }[]; caseId?: string }) {
  return (
    <>
      <Field label="Title"><input className="input" name="title" required placeholder="e.g. Hearing on motion to compel" /></Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Type">
          <select className="input" name="type" defaultValue="hearing"><option value="hearing">Hearing</option><option value="deadline">Deadline</option><option value="meeting">Meeting</option><option value="internal">Internal</option></select>
        </Field>
        <Field label="Date"><input className="input" type="date" name="date" required /></Field>
        <Field label="Time" hint="Blank = all day"><input className="input" type="time" name="time" /></Field>
      </div>
      {caseId ? <input type="hidden" name="caseId" value={caseId} /> : cases && (
        <Field label="Matter"><select className="input" name="caseId" defaultValue=""><option value="">Firm-wide</option>{cases.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</select></Field>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Location"><input className="input" name="location" placeholder="Court, room or link" /></Field>
        <Field label="Judge / arbitrator"><input className="input" name="judge" /></Field>
      </div>
      <Field label="Notes"><textarea className="input" name="notes" rows={2} /></Field>
    </>
  );
}

export function TaskFields({ cases, people, caseId }: { cases?: { id: string; title: string }[]; people: { id: string; name: string }[]; caseId?: string }) {
  return (
    <>
      <Field label="Task"><input className="input" name="title" required placeholder="e.g. Finalise hearing bundle" /></Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Due date"><input className="input" type="date" name="due" /></Field>
        <Field label="Priority">
          <select className="input" name="priority" defaultValue="medium"><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select>
        </Field>
        <Field label="Assignee"><select className="input" name="assigneeId" defaultValue=""><option value="">Me</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
      </div>
      {caseId ? <input type="hidden" name="caseId" value={caseId} /> : cases && (
        <Field label="Matter"><select className="input" name="caseId" defaultValue=""><option value="">No matter</option>{cases.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</select></Field>
      )}
      <Field label="Details"><textarea className="input" name="description" rows={2} /></Field>
    </>
  );
}
