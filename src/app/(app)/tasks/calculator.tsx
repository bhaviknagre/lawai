"use client";
import { useMemo, useState } from "react";
import { computeDeadline, type DeadlineRule } from "@/lib/deadlines";

export function DeadlineCalculator({ rules }: { rules: (DeadlineRule & { jurisdiction: string })[] }) {
  const sets = Array.from(new Set(rules.map((r) => r.ruleSet)));
  const [set, setSet] = useState(sets[0] ?? "");
  const options = rules.filter((r) => r.ruleSet === set);
  const [ruleId, setRuleId] = useState(options[0]?.id ?? "");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const rule = rules.find((r) => r.id === ruleId) ?? options[0];
  const out = useMemo(() => (rule && date ? computeDeadline(rule, new Date(`${date}T12:00`)) : null), [rule, date]);
  return (
    <section className="card flex flex-col gap-3 p-5">
      <h2 className="h2">Deadline calculator</h2>
      <label className="label">Court rules
        <select className="input" value={set} onChange={(e) => { setSet(e.target.value); setRuleId(rules.find((r) => r.ruleSet === e.target.value)?.id ?? ""); }}>
          {sets.map((s) => <option key={s}>{s}</option>)}
        </select>
      </label>
      <label className="label">Trigger
        <select className="input" value={rule?.id ?? ""} onChange={(e) => setRuleId(e.target.value)}>
          {options.map((r) => <option key={r.id} value={r.id}>{r.trigger}</option>)}
        </select>
      </label>
      <label className="label">Trigger date<input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
      {out && rule && (
        <div className="rounded-xl border border-line bg-sunken p-4">
          <div className="text-[13px] font-semibold text-muted">{rule.resultLabel}</div>
          <div className="mt-1 font-display text-[22px] font-bold">{out.dueLabel}</div>
          <div className="mt-1 text-[13px] text-muted">{out.explanation}</div>
          {rule.notes && <div className="mt-1 text-[13px]">{rule.notes}</div>}
        </div>
      )}
      <p className="text-[12px] text-subtle">Weekends roll forward where the rule allows. Court holidays and court orders aren't applied, so verify before relying on this.</p>
    </section>
  );
}
