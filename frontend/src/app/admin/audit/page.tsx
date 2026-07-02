"use client";

import * as React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, ScrollText } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import type { Admin, AuditLogEntry, AuditLogPage } from "@/lib/types";
import { useIsOwner } from "@/components/admin/auth-context";
import { formatDateTimeShort } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

// Known audit actions (kept in sync with backend log_action calls).
const ACTIONS = [
  "create",
  "update",
  "admin_created",
  "admin_role_changed",
  "admin_deactivated",
  "admin_reactivated",
  "admin_password_reset",
  "admin_password_changed",
  "upload_flyer",
  "remove_flyer",
];

const ENTITY_TYPES = ["admin", "event", "invite_tree", "rsvp"];

function humanize(s: string): string {
  return s.replace(/_/g, " ");
}

function metaSummary(meta: Record<string, unknown>): string {
  const entries = Object.entries(meta || {});
  if (entries.length === 0) return "—";
  return entries
    .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    .join(" · ");
}

export default function AuditPage() {
  const isOwner = useIsOwner();
  const [data, setData] = useState<AuditLogPage | null>(null);
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [action, setAction] = useState("");
  const [adminId, setAdminId] = useState("");
  const [entityType, setEntityType] = useState("");
  const [since, setSince] = useState("");
  const [until, setUntil] = useState("");
  const [limit, setLimit] = useState(100);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (action) p.set("action", action);
    if (adminId) p.set("admin_id", adminId);
    if (entityType) p.set("entity_type", entityType);
    if (since) p.set("since", new Date(since).toISOString());
    if (until) p.set("until", new Date(until).toISOString());
    p.set("limit", String(limit));
    return p.toString();
  }, [action, adminId, entityType, since, until, limit]);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api
      .get<AuditLogPage>(`/api/admin/audit-logs?${query}`, true)
      .then(setData)
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : "Failed to load audit log.")
      )
      .finally(() => setLoading(false));
  }, [query]);

  useEffect(() => {
    if (isOwner) load();
    else setLoading(false);
  }, [isOwner, load]);

  // Admin filter options (owners can read the admin list).
  useEffect(() => {
    if (!isOwner) return;
    api.get<Admin[]>("/api/admin/admins", true).then(setAdmins).catch(() => {});
  }, [isOwner]);

  if (!isOwner) {
    return (
      <Card className="mx-auto max-w-lg">
        <CardContent className="py-12 text-center">
          <ScrollText className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
          <p className="font-medium text-foreground">Owners only</p>
          <p className="mt-1 text-sm text-muted-foreground">
            The audit log is visible to owners only.
          </p>
        </CardContent>
      </Card>
    );
  }

  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-bold text-royal">Audit log</h1>
        <p className="text-sm text-muted-foreground">
          A record of important admin actions across the platform.
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="grid grid-cols-1 gap-3 pt-5 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1">
            <Label className="text-xs">Action</Label>
            <Select value={action} onChange={(e) => setAction(e.target.value)}>
              <option value="">All actions</option>
              {ACTIONS.map((a) => (
                <option key={a} value={a}>
                  {humanize(a)}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Admin</Label>
            <Select value={adminId} onChange={(e) => setAdminId(e.target.value)}>
              <option value="">All admins</option>
              {admins.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.full_name || a.email}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Entity</Label>
            <Select value={entityType} onChange={(e) => setEntityType(e.target.value)}>
              <option value="">All entities</option>
              {ENTITY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {humanize(t)}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">From</Label>
            <Input type="date" value={since} onChange={(e) => setSince(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">To</Label>
            <Input type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      )}

      {loading ? (
        <Skeleton className="h-96 w-full rounded-xl" />
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No audit entries match your filters.
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">When</th>
                    <th className="px-4 py-3 font-medium">Who</th>
                    <th className="px-4 py-3 font-medium">Action</th>
                    <th className="px-4 py-3 font-medium">Entity</th>
                    <th className="px-4 py-3 font-medium">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {items.map((e) => (
                    <tr key={e.id} className="align-top hover:bg-muted/30">
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                        {formatDateTimeShort(e.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        {e.admin_email ? (
                          <span className="text-foreground">
                            {e.admin_name || e.admin_email}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">system</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-medium text-foreground">
                          {humanize(e.action)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Badge status="default">{humanize(e.entity_type)}</Badge>
                        <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                          {e.entity_id ? e.entity_id.slice(0, 8) : "—"}
                        </p>
                      </td>
                      <td className="max-w-xs px-4 py-3 text-xs text-muted-foreground">
                        {metaSummary(e.meta)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Showing {items.length} of {total}
            </p>
            {items.length < total && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLimit((l) => l + 100)}
              >
                Load more
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
