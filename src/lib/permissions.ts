/**
 * Who can do what. The single source of truth for role-based access: pages, navigation and
 * server actions all check here, so changing a role's rights is a one-line edit.
 *
 * Matter visibility is separate (src/lib/access.ts): admins see every matter, everyone else
 * only the matters they're staffed on.
 */
export type Role = "admin" | "attorney" | "paralegal";

export const PERMISSIONS = {
  /** Open a new matter. Paralegals work on matters an attorney opened. */
  "matters.create": ["admin", "attorney"],
  /** Choose who is staffed on a matter and who leads it. */
  "matters.team": ["admin", "attorney"],
  /** Put a matter on hold or close it. Paralegals can still update stage, priority and court. */
  "matters.status": ["admin", "attorney"],
  /** Mark a document final, signed or filed. Paralegals can move it between draft and in review. */
  "documents.finalize": ["admin", "attorney"],
  "documents.delete": ["admin", "attorney"],
  /** Firm-wide billable hours, revenue and utilisation. */
  "reports.view": ["admin", "attorney"],
  /** Invite people, change roles, reset passwords, deactivate. */
  "team.manage": ["admin"],
  "firm.settings": ["admin"],
  "playbook.edit": ["admin"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(user: { role: Role }, permission: Permission) {
  return (PERMISSIONS[permission] as readonly Role[]).includes(user.role);
}

export function assertCan(user: { role: Role }, permission: Permission) {
  if (!can(user, permission)) throw new Error("Your role doesn't allow this. Ask your firm's admin.");
}

/** Pages a role can't open. Navigation hides them and the page itself refuses (requirePermission). */
export const ROUTE_PERMISSIONS: { prefix: string; permission: Permission }[] = [
  { prefix: "/reports", permission: "reports.view" },
  { prefix: "/cases/new", permission: "matters.create" },
];

export const canOpen = (user: { role: Role }, href: string) =>
  ROUTE_PERMISSIONS.every((r) => !href.startsWith(r.prefix) || can(user, r.permission));

export const DOC_STATUSES_FOR = (user: { role: Role }) =>
  can(user, "documents.finalize")
    ? (["draft", "in_review", "final", "signed", "filed"] as const)
    : (["draft", "in_review"] as const);
