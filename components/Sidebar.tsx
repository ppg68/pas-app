"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ROLE_LABEL, type Role } from "@/lib/domain/procedures";

export default function Sidebar({
  fullName,
  roles,
  canCreateRequest,
  canSeeContracts,
  onSignOut,
}: {
  fullName: string;
  roles: Role[];
  canCreateRequest: boolean;
  canSeeContracts: boolean;
  onSignOut: () => void;
}) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <aside className="sidebar">
      <div className="brand">
        PAS
        <span>Istituto Oikos</span>
      </div>

      <div className="identity">
        <b>{fullName}</b>
        {roles.length > 0 ? roles.map((r) => ROLE_LABEL[r]).join(", ") : "no role"}
      </div>

      <nav className="nav">
        <Link href="/" className={isActive("/") ? "active" : ""}>
          Requests
        </Link>
        {canCreateRequest && (
          <Link href="/requests/new" className={isActive("/requests/new") ? "active" : ""}>
            New request
          </Link>
        )}
        {canSeeContracts && (
          <Link href="/contracts" className={isActive("/contracts") ? "active" : ""}>
            Contracts
          </Link>
        )}
        {canSeeContracts && (
          <Link href="/invoices" className={isActive("/invoices") ? "active" : ""}>
            Invoices
          </Link>
        )}
        <Link href="/settings/team" className={isActive("/settings/team") ? "active" : ""}>
          Team
        </Link>
      </nav>

      <form action={onSignOut}>
        <button type="submit" className="sidebar-action">
          Sign out
        </button>
      </form>
    </aside>
  );
}
