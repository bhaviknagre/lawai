import { requireUser } from "@/lib/auth";
import { ActionForm } from "@/components/forms";
import { ClientFields } from "@/components/client-fields";
import { PageHeader } from "@/components/ui";
import { createClient } from "@/app/actions/practice";

export const metadata = { title: "New client" };

export default async function NewClientPage() {
  await requireUser();
  return (
    <>
      <PageHeader title="New client" />
      <div className="card max-w-3xl p-6">
        <ActionForm action={createClient} submitLabel="Create client" resetOnSuccess={false}>
          <ClientFields />
          <label className="flex items-center gap-2 text-[14px]"><input type="checkbox" name="conflictChecked" className="h-4 w-4 accent-[#2b44d6]" />Conflict check completed today</label>
        </ActionForm>
      </div>
    </>
  );
}
