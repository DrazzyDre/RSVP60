"use client";

import * as React from "react";
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  Loader2,
  Mail,
  RefreshCw,
  Send,
  ServerCog,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import type {
  CommunicationLog,
  CommunicationsStatus,
  ReminderAudience,
  ReminderSendResult,
} from "@/lib/types";
import { useEvents } from "@/components/admin/event-context";
import { useCanEdit } from "@/components/admin/auth-context";
import { EmptyEventState } from "@/components/admin/EmptyEventState";
import { formatDateTimeShort } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const COMM_TYPE_LABELS: Record<string, string> = {
  rsvp_confirmation: "RSVP confirmation",
  rsvp_status_update: "Status update",
  event_reminder: "Event reminder",
  check_in_acknowledgement: "Check-in welcome",
  host_tree_exhausted: "Host: allocation full",
  host_waitlisted_rsvp: "Host: guest waitlisted",
  host_reminder_complete: "Host: reminders sent",
};

const STATUS_BADGE: Record<string, string> = {
  sent: "bg-green-100 text-green-800 border-green-200",
  failed: "bg-red-100 text-red-700 border-red-200",
  skipped: "bg-gray-100 text-gray-600 border-gray-200",
  pending: "bg-amber-100 text-amber-800 border-amber-200",
};

export default function CommunicationsPage() {
  const { selectedEventId, selectedEvent, loading: eventsLoading } = useEvents();
  const canEdit = useCanEdit();

  const [status, setStatus] = useState<CommunicationsStatus | null>(null);
  const [audience, setAudience] = useState<ReminderAudience | null>(null);
  const [excludeCheckedIn, setExcludeCheckedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<string | null>(null);
  const [resendPrompt, setResendPrompt] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!selectedEventId) return;
    setLoading(true);
    setError(null);
    Promise.all([
      api.get<CommunicationsStatus>(
        `/api/admin/communications/status?event_id=${selectedEventId}`,
        true
      ),
      api.get<ReminderAudience>(
        `/api/admin/communications/reminder/preview?event_id=${selectedEventId}&exclude_checked_in=${excludeCheckedIn}`,
        true
      ),
    ])
      .then(([s, a]) => {
        setStatus(s);
        setAudience(a);
      })
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : "Failed to load.")
      )
      .finally(() => setLoading(false));
  }, [selectedEventId, excludeCheckedIn]);

  useEffect(() => {
    load();
  }, [load]);

  async function send(confirmResend: boolean) {
    if (!selectedEventId) return;
    setSending(true);
    setSendResult(null);
    setError(null);
    try {
      const res = await api.post<ReminderSendResult>(
        `/api/admin/communications/reminder/send?event_id=${selectedEventId}`,
        { exclude_checked_in: excludeCheckedIn, confirm_resend: confirmResend },
        true
      );
      setSendResult(res.message);
      setResendPrompt(null);
      load();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // Already sent — ask for an explicit resend confirmation.
        setResendPrompt(err.message);
      } else {
        setError(err instanceof ApiError ? err.message : "Send failed.");
      }
    } finally {
      setSending(false);
    }
  }

  if (!eventsLoading && !selectedEventId) return <EmptyEventState />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-bold text-royal">Communications</h1>
        <p className="text-sm text-muted-foreground">
          {selectedEvent
            ? `Guest email for ${selectedEvent.name}`
            : "Send confirmations, reminders and host alerts by email."}
        </p>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      )}

      {loading || eventsLoading || !status || !audience ? (
        <div className="space-y-4">
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      ) : (
        <>
          <BackendCard status={status} />

          <ReminderPanel
            audience={audience}
            canEdit={canEdit}
            sending={sending}
            excludeCheckedIn={excludeCheckedIn}
            onToggleExclude={setExcludeCheckedIn}
            onSend={() => send(false)}
            sendResult={sendResult}
            resendPrompt={resendPrompt}
            onConfirmResend={() => send(true)}
            onCancelResend={() => setResendPrompt(null)}
          />

          <RecentLog logs={status.recent} onRefresh={load} />
        </>
      )}
    </div>
  );
}

function BackendCard({ status }: { status: CommunicationsStatus }) {
  const { email } = status;
  const ok = email.configured;
  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2 space-y-0">
        <ServerCog className="h-5 w-5 text-royal" />
        <CardTitle className="text-base">Email delivery</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-3">
        <Field label="Backend">
          <span className="font-medium capitalize">{email.backend}</span>{" "}
          {email.is_live_provider ? (
            <Badge className="ml-1 bg-royal/10 text-royal">live provider</Badge>
          ) : (
            <Badge className="ml-1 bg-amber-100 text-amber-800 border-amber-200">
              console (dev)
            </Badge>
          )}
        </Field>
        <Field label="Status">
          {ok ? (
            <span className="inline-flex items-center gap-1 font-medium text-green-700">
              <CheckCircle2 className="h-4 w-4" /> Configured
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 font-medium text-red-700">
              <AlertTriangle className="h-4 w-4" /> Missing credentials
            </span>
          )}
        </Field>
        <Field label="From address">
          <span className="text-muted-foreground">
            {email.from_address
              ? `${email.from_name} <${email.from_address}>`
              : "—"}
          </span>
        </Field>
        <Field label="Host alerts to">
          <span className="text-muted-foreground">
            {status.host_notification_email || "Not set (edit in event settings)"}
          </span>
        </Field>
        <Field label="Alert: allocation full">
          {status.notify_tree_exhausted ? "On" : "Off"}
        </Field>
        <Field label="Alert: guest waitlisted">
          {status.notify_waitlisted_rsvp ? "On" : "Off"}
        </Field>
      </CardContent>
      {!email.configured && (
        <div className="mx-6 mb-5 rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-800">
          A live provider is selected but its credentials are missing — emails
          will not send. Set the provider API key and from-address, or use the
          console backend for local testing.
        </div>
      )}
    </Card>
  );
}

function ReminderPanel({
  audience,
  canEdit,
  sending,
  excludeCheckedIn,
  onToggleExclude,
  onSend,
  sendResult,
  resendPrompt,
  onConfirmResend,
  onCancelResend,
}: {
  audience: ReminderAudience;
  canEdit: boolean;
  sending: boolean;
  excludeCheckedIn: boolean;
  onToggleExclude: (v: boolean) => void;
  onSend: () => void;
  sendResult: string | null;
  resendPrompt: string | null;
  onConfirmResend: () => void;
  onCancelResend: () => void;
}) {
  const [showPreview, setShowPreview] = useState(false);

  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2 space-y-0">
        <Mail className="h-5 w-5 text-royal" />
        <CardTitle className="text-base">Event reminder</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Audience */}
        <div className="grid gap-3 sm:grid-cols-4">
          <Stat label="Eligible" value={audience.eligible_count} accent="text-royal" />
          <Stat label="Accepted total" value={audience.total_accepted} />
          <Stat label="No email" value={audience.accepted_without_email} />
          <Stat label="Not opted in" value={audience.accepted_not_opted_in} />
        </div>

        <p className="text-sm text-muted-foreground">
          Reminders go only to <strong>accepted</strong> guests who{" "}
          <strong>opted in</strong> to email. Declined, cancelled and waitlisted
          guests are never included.
          {audience.last_reminder_sent_at && (
            <>
              {" "}
              Last sent{" "}
              <strong>{formatDateTimeShort(audience.last_reminder_sent_at)}</strong>.
            </>
          )}
        </p>

        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={excludeCheckedIn}
            onChange={(e) => onToggleExclude(e.target.checked)}
            className="h-4 w-4 rounded border-input accent-royal"
          />
          Exclude already checked-in guests
          {audience.checked_in_eligible > 0 && (
            <span className="text-muted-foreground">
              ({audience.checked_in_eligible} checked in)
            </span>
          )}
        </label>

        {/* Sample recipients */}
        {audience.sample.length > 0 && (
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">
              Sample recipients
            </p>
            <ul className="space-y-1 text-sm">
              {audience.sample.map((r) => (
                <li key={r.email} className="flex justify-between gap-2">
                  <span className="truncate">
                    {r.full_name}{" "}
                    <span className="text-muted-foreground">· {r.email}</span>
                  </span>
                  {r.checked_in && (
                    <span className="text-xs text-green-700">checked in</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => setShowPreview((p) => !p)}>
            <Eye className="h-4 w-4" /> {showPreview ? "Hide" : "Preview"} email
          </Button>
          {canEdit ? (
            <Button
              onClick={onSend}
              disabled={sending || audience.eligible_count === 0}
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Send reminder to {audience.eligible_count}
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">
              You can view communications but not send them.
            </p>
          )}
        </div>

        {resendPrompt && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
            <p className="flex items-start gap-2 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              {resendPrompt}
            </p>
            <div className="mt-3 flex gap-2">
              <Button size="sm" onClick={onConfirmResend} disabled={sending}>
                {sending && <Loader2 className="h-4 w-4 animate-spin" />}
                Yes, resend now
              </Button>
              <Button size="sm" variant="outline" onClick={onCancelResend}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {sendResult && (
          <p className="flex items-center gap-2 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">
            <CheckCircle2 className="h-4 w-4" /> {sendResult}
          </p>
        )}

        {showPreview && audience.preview && (
          <EmailPreviewBox
            subject={audience.preview.subject}
            html={audience.preview.html}
          />
        )}
      </CardContent>
    </Card>
  );
}

function EmailPreviewBox({ subject, html }: { subject: string; html: string }) {
  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="border-b bg-muted/40 px-4 py-2 text-sm">
        <span className="text-muted-foreground">Subject:</span>{" "}
        <span className="font-medium">{subject}</span>
      </div>
      {/* Sandboxed iframe so email HTML can't run scripts or touch the app. */}
      <iframe
        title="Email preview"
        sandbox=""
        srcDoc={html}
        className="h-[420px] w-full bg-white"
      />
    </div>
  );
}

function RecentLog({
  logs,
  onRefresh,
}: {
  logs: CommunicationLog[];
  onRefresh: () => void;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Recent activity</CardTitle>
        <Button size="sm" variant="ghost" onClick={onRefresh}>
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {logs.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-muted-foreground">
            No communications yet for this event.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Type</th>
                  <th className="px-4 py-2 font-medium">Recipient</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">When</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {logs.map((l) => (
                  <tr key={l.id} className="align-top">
                    <td className="px-4 py-2">
                      {COMM_TYPE_LABELS[l.communication_type] ?? l.communication_type}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {l.recipient || "—"}
                    </td>
                    <td className="px-4 py-2">
                      <Badge className={STATUS_BADGE[l.status] ?? ""}>
                        {l.status}
                      </Badge>
                      {l.error_summary && (
                        <span className="ml-2 text-xs text-red-600">
                          {l.error_summary}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {formatDateTimeShort(l.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm">{children}</p>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: string;
}) {
  return (
    <div className="rounded-lg border bg-white p-3">
      <p className="text-xs font-medium uppercase text-muted-foreground">{label}</p>
      <p className={`mt-1 text-xl font-bold ${accent ?? "text-foreground"}`}>{value}</p>
    </div>
  );
}
