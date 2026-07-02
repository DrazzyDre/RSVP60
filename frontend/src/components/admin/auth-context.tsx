"use client";

import * as React from "react";
import { createContext, useContext } from "react";
import type { Admin } from "@/lib/types";

/**
 * Holds the currently signed-in admin (already fetched by the admin layout).
 * Pages read the role from here to show/hide UI. All permissions are still
 * enforced by the backend — this is purely a UX convenience.
 */
const AuthContext = createContext<Admin | null>(null);

export function AuthProvider({
  admin,
  children,
}: {
  admin: Admin | null;
  children: React.ReactNode;
}) {
  return <AuthContext.Provider value={admin}>{children}</AuthContext.Provider>;
}

export function useAuth(): Admin | null {
  return useContext(AuthContext);
}

export function useRole(): Admin["role"] | null {
  return useContext(AuthContext)?.role ?? null;
}

/** owner or admin — may mutate events / invite trees / RSVPs. */
export function useCanEdit(): boolean {
  const role = useRole();
  return role === "owner" || role === "admin";
}

/** owner — may manage other admin accounts. */
export function useIsOwner(): boolean {
  return useRole() === "owner";
}
