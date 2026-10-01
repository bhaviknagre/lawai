"use client";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { X } from "lucide-react";
import type { FormState } from "@/app/actions/practice";
import { cn } from "@/lib/utils";

type Action = (state: FormState, form: FormData) => Promise<FormState>;

/** Form bound to a server action: shows errors, pending state and a success note; optionally resets. */
export function ActionForm({
  action, children, submitLabel, className, resetOnSuccess = true, successText, onSuccess,
}: {
  action: Action; children: React.ReactNode; submitLabel: string; className?: string; resetOnSuccess?: boolean; successText?: string; onSuccess?: () => void;
}) {
  const [state, run, pending] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) {
      if (resetOnSuccess) ref.current?.reset();
      onSuccess?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  return (
    <form ref={ref} action={run} className={cn("flex flex-col gap-4", className)}>
      {children}
      {state?.error && <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-[13.5px] text-bad">{state.error}</p>}
      {state?.ok && successText && <p role="status" className="rounded-lg bg-good-soft px-3 py-2 text-[13.5px] text-good">{successText}</p>}
      <div><button className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : submitLabel}</button></div>
    </form>
  );
}

/** Button that opens a modal containing an ActionForm; closes on success. */
export function FormDialog({
  label, title, action, submitLabel, children, buttonClass = "btn btn-secondary", icon,
}: {
  label: string; title: string; action: Action; submitLabel: string; children: React.ReactNode; buttonClass?: string; icon?: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [key, setKey] = useState(0);
  return (
    <>
      <button type="button" className={buttonClass} onClick={() => ref.current?.showModal()}>{icon}{label}</button>
      <dialog ref={ref} className="m-auto w-[min(560px,calc(100vw-32px))] rounded-2xl border border-line p-0 shadow-2xl backdrop:bg-ink/50" onClose={() => setKey((k) => k + 1)}>
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <h2 className="h2">{title}</h2>
          <button type="button" aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-chip" onClick={() => ref.current?.close()}><X size={18} /></button>
        </div>
        <div className="max-h-[75vh] overflow-y-auto px-6 py-5">
          <ActionForm key={key} action={action} submitLabel={submitLabel} onSuccess={() => ref.current?.close()}>
            {children}
          </ActionForm>
        </div>
      </dialog>
    </>
  );
}

/** Checkbox that calls a server action immediately (optimistic). */
export function ToggleCheck({ checked, onToggle, label }: { checked: boolean; onToggle: (v: boolean) => Promise<void>; label: string }) {
  const [on, setOn] = useState(checked);
  const [pending, start] = useTransition();
  return (
    <input
      type="checkbox"
      aria-label={label}
      checked={on}
      disabled={pending}
      onChange={(e) => {
        const v = e.target.checked;
        setOn(v);
        start(() => onToggle(v));
      }}
      className="h-5 w-5 shrink-0 cursor-pointer accent-[#2b44d6]"
    />
  );
}

export function ConfirmButton({ onConfirm, children, message, className }: { onConfirm: () => Promise<void>; children: React.ReactNode; message: string; className?: string }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" disabled={pending} className={className} onClick={() => confirm(message) && start(() => onConfirm())}>
      {children}
    </button>
  );
}
