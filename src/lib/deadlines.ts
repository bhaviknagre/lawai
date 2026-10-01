import { addDays, addMonths, format, isSaturday, isSunday } from "date-fns";

export type DeadlineRule = {
  id: string;
  ruleSet: string;
  trigger: string;
  resultLabel: string;
  amount: number;
  unit: string;
  rollForward: boolean;
  citation: string;
  notes: string | null;
};

/**
 * Compute a deadline from a trigger date. Weekends roll forward to Monday when the rule says so.
 * Court holidays are NOT applied — add a holidays table per jurisdiction before relying on this in production.
 */
export function computeDeadline(rule: DeadlineRule, trigger: Date) {
  let due = rule.unit === "months" ? addMonths(trigger, rule.amount) : addDays(trigger, rule.amount);
  let rolled = false;
  if (rule.rollForward) {
    while (isSaturday(due) || isSunday(due)) {
      due = addDays(due, 1);
      rolled = true;
    }
  }
  return {
    due,
    dueLabel: format(due, "EEE d MMM yyyy"),
    explanation: `${rule.amount} ${rule.unit} after ${rule.trigger.toLowerCase()}${rolled ? ", moved to the next weekday" : ""} · ${rule.citation}`,
  };
}
