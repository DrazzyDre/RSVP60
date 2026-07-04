"use client";

import * as React from "react";
import { useCallback, useEffect, useState } from "react";
import {
  Check,
  KeyRound,
  Loader2,
  Plus,
  ShieldCheck,
  UserCheck,
  UserX,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import type { Admin, AdminRole } from "@/lib/types";
import { useAuth, useIsOwner } from "@/components/admin/auth-context";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm";
import { formatDateTimeShort } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

const ROLES: AdminRole[] = ["owner", "admin", "viewer"];

const ROLE_BADGE: Record<AdminRole, string> = {
  owner: "default",
  admin: "active",
  viewer: "paused",
};

export default function AdminsPage() {
  const isOwner = useIsOwner();
  const me = useAuth();
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api
      .get<Admin[]>("/api/admin/admins", true)
      .then(setAdmins)
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : "Failed to load admins.")
      )
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (isOwner) load();
    else setLoading(false);
  }, [isOwner, load]);

  if (!isOwner) {
    return (
      <Card className="mx-auto max-w-lg">
        <CardContent className="py-12 text-center">
          <ShieldCheck className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
          <p className="font-medium text-foreground">Owners only</p>
          <p className="mt-1 text-sm text-muted-foreground">
            You don&apos;t have permission to manage admin accounts. Ask an owner
            if you need access.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold text-royal">Admins</h1>
          <p className="text-sm text-muted-foreground">
            Manage who can access this dashboard and what they can do.
          </p>
        </div>
        <Button onClick={() => setShowCreate((s) => !s)}>
          <Plus className="h-4 w-4" /> New admin
        </Button>
      </div>

      {showCreate && (
        <CreateAdminCard
          onCreated={() => {
            setShowCreate(false);
            load();
          }}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      )}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {admins.map((a) => (
            <AdminCard
              key={a.id}
              admin={a}
              isSelf={a.id === me?.id}
              onChanged={load}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CreateAdminCard({
  onCreated,
  onCancel,
}: {
  onCreated: () => void;
  onCancel: () => void;
}) {
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<AdminRole>("viewer");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setError(null);
    setSaving(true);
    try {
      await api.post(
        "/api/admin/admins",
        { email, full_name: fullName, role, password },
        true
      );
      toast.success("Admin account created.");
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create admin.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">New admin</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Email</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@gatherarc.com"
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Full name</Label>
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Jane Doe"
            />
          </div>
          <div className="space-y-2">
            <Label>Role</Label>
            <Select
              value={role}
              onChange={(e) => setRole(e.target.value as AdminRole)}
            >
              {ROLES.map((r) => (
                <option key={r} value={r} className="capitalize">
                  {r}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Temporary password</Label>
            <Input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              minLength={8}
              required
            />
          </div>
          {error && (
            <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700 sm:col-span-2">
              {error}
            </p>
          )}
          <div className="flex gap-3 sm:col-span-2">
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Create admin
            </Button>
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function AdminCard({
  admin,
  isSelf,
  onChanged,
}: {
  admin: Admin;
  isSelf: boolean;
  onChanged: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPw, setShowPw] = useState(false);
  const [pw, setPw] = useState("");
  const [pwDone, setPwDone] = useState(false);

  async function run(fn: () => Promise<unknown>, successMessage?: string) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onChanged();
      if (successMessage) toast.success(successMessage);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Action failed.";
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  async function deactivate() {
    const ok = await confirm({
      title: `Deactivate ${admin.full_name || admin.email}?`,
      description:
        "They will be signed out and cannot log in until an owner reactivates the account.",
      confirmLabel: "Deactivate",
      cancelLabel: "Cancel",
      destructive: true,
    });
    if (ok) {
      run(
        () => api.patch(`/api/admin/admins/${admin.id}/deactivate`, {}),
        "Admin deactivated."
      );
    }
  }

  async function setPassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/api/admin/admins/${admin.id}/password`, { password: pw });
      setPw("");
      setShowPw(false);
      setPwDone(true);
      toast.success("Password set.");
      setTimeout(() => setPwDone(false), 2000);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Could not set password.";
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className={admin.is_active ? "" : "opacity-70"}>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-lg">
              {admin.full_name || admin.email}
              {isSelf && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  (you)
                </span>
              )}
            </CardTitle>
            <p className="text-sm text-muted-foreground">{admin.email}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge status={ROLE_BADGE[admin.role]}>{admin.role}</Badge>
            <Badge status={admin.is_active ? "active" : "cancelled"}>
              {admin.is_active ? "active" : "inactive"}
            </Badge>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Last login: {formatDateTimeShort(admin.last_login_at)} · Added{" "}
          {formatDateTimeShort(admin.created_at)}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Role</Label>
            <Select
              value={admin.role}
              disabled={busy || isSelf}
              onChange={(e) =>
                run(
                  () =>
                    api.patch(`/api/admin/admins/${admin.id}`, {
                      role: e.target.value,
                    }),
                  "Role updated."
                )
              }
              className="w-36"
            >
              {ROLES.map((r) => (
                <option key={r} value={r} className="capitalize">
                  {r}
                </option>
              ))}
            </Select>
          </div>

          {admin.is_active ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy || isSelf}
              onClick={deactivate}
            >
              <UserX className="h-4 w-4" /> Deactivate
            </Button>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() =>
                run(
                  () => api.patch(`/api/admin/admins/${admin.id}/reactivate`, {}),
                  "Admin reactivated."
                )
              }
            >
              <UserCheck className="h-4 w-4" /> Reactivate
            </Button>
          )}

          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => setShowPw((s) => !s)}
          >
            {pwDone ? (
              <Check className="h-4 w-4 text-green-600" />
            ) : (
              <KeyRound className="h-4 w-4" />
            )}
            {pwDone ? "Password set" : "Set password"}
          </Button>
        </div>

        {isSelf && (
          <p className="text-xs text-muted-foreground">
            You can&apos;t change your own role or deactivate yourself.
          </p>
        )}

        {showPw && (
          <form onSubmit={setPassword} className="flex flex-wrap items-center gap-2">
            <Input
              type="text"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="New password (min 8 chars)"
              minLength={8}
              required
              className="max-w-xs"
            />
            <Button type="submit" size="sm" disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setShowPw(false)}
            >
              Cancel
            </Button>
          </form>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
      </CardContent>
    </Card>
  );
}
