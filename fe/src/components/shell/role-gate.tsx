"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { canAccess, type RouteKey } from "@/lib/rbac";
import { useSession } from "@/lib/session-context";

/** Renders children only when the active (simulated) role may access the route.
 * If unauthorized, immediately redirects to /dashboard without rendering restricted boxes.
 */
export function RoleGate({ route, children }: { route: RouteKey; children: ReactNode }) {
  const { role } = useSession();
  const router = useRouter();

  const isAllowed = role ? canAccess(route, role) : false;

  useEffect(() => {
    if (role && !isAllowed) {
      router.replace("/dashboard");
    }
  }, [role, isAllowed, router]);

  if (!role || !isAllowed) return null;

  return <>{children}</>;
}
