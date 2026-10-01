"use client";
import { toggleTask } from "@/app/actions/practice";
import { ToggleCheck } from "./forms";

export function TaskCheck({ id, done, title }: { id: string; done: boolean; title: string }) {
  return <ToggleCheck checked={done} label={`Mark "${title}" ${done ? "not done" : "done"}`} onToggle={(v) => toggleTask(id, v)} />;
}
