// Shared types mirroring the FastAPI response schemas.

export type EventType =
  | "birthday"
  | "wedding"
  | "funeral"
  | "memorial"
  | "anniversary"
  | "church"
  | "dinner"
  | "conference"
  | "other";

export type EventStatus = "draft" | "active" | "closed" | "archived";

export type ThemePreset =
  | "elegant"
  | "classic"
  | "joyful"
  | "minimal"
  | "formal";

export type BackgroundPreset = "" | "soft" | "plain" | "festive";

export interface EventPublic {
  name: string;
  event_type: EventType;
  host_or_celebrant_name: string;
  title: string;
  invite_headline: string;
  invite_message: string;
  description: string;
  event_date: string | null;
  event_time: string;
  venue_name: string;
  venue_address: string;
  maps_url: string;
  dress_code: string;
  gift_details: string;
  contact_phone: string;
  flyer_url: string;
  flyer_image_url: string;
  rsvp_deadline: string | null;
  theme_preset: ThemePreset;
  accent_color: string;
  background_preset: BackgroundPreset;
}

export interface EventAdmin {
  id: string;
  name: string;
  event_type: EventType;
  host_or_celebrant_name: string;
  title: string;
  invite_headline: string;
  invite_message: string;
  description: string;
  event_date: string | null;
  event_time: string;
  venue_name: string;
  venue_address: string;
  maps_url: string;
  dress_code: string;
  gift_details: string;
  contact_phone: string;
  flyer_url: string;
  flyer_storage_path: string;
  flyer_image_url: string;
  rsvp_deadline: string | null;
  auto_close_rsvp: boolean;
  theme_preset: ThemePreset;
  accent_color: string;
  background_preset: BackgroundPreset;
  status: EventStatus;
  host_notification_email: string;
  notify_tree_exhausted: boolean;
  notify_waitlisted_rsvp: boolean;
  tree_count: number;
  rsvp_count: number;
  confirmed_seats: number;
  // Event-level RSVP availability (ignores per-tree pauses).
  accepting_rsvps: boolean;
  availability_reason: string;
  availability_label: string;
  // Readiness checklist summary (completed/total server-side items).
  readiness_completed: number;
  readiness_total: number;
  created_at: string;
  updated_at: string;
}

export interface InvitePublic {
  event: EventPublic;
  accepting_rsvps: boolean;
  plus_one_allowed: number;
  seat_options: number[];
  existing_rsvp: RsvpPublicOut | null;
}

export interface RsvpPublicOut {
  id: string;
  full_name: string;
  attendance_status: string;
  rsvp_status: string;
  seats_requested: number;
}

export interface RsvpCreateResponse {
  rsvp: RsvpPublicOut;
  status: "accepted" | "waitlisted" | "declined";
  updated: boolean;
  message: string;
}

export type AdminRole = "owner" | "admin" | "viewer";

export interface Admin {
  id: string;
  email: string;
  full_name: string;
  role: AdminRole;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  admin: Admin;
}

export type TreeComputedStatus =
  | "active"
  | "almost_full"
  | "exhausted"
  | "paused";

export interface InviteTree {
  id: string;
  name: string;
  token: string;
  allocated_seats: number;
  max_extra_guests: number;
  status: "active" | "paused";
  computed_status: TreeComputedStatus;
  used_seats: number;
  remaining_seats: number;
  rsvp_count: number;
  invite_url: string;
  // Whether guests using THIS tree's link can currently RSVP, and why not.
  accepting_rsvps: boolean;
  availability_reason: string;
  availability_label: string;
  created_at: string;
  updated_at: string;
}

export type RsvpStatus = "accepted" | "declined" | "waitlisted" | "cancelled";

export interface RsvpAdmin {
  id: string;
  invite_tree_id: string;
  invite_tree_name: string;
  full_name: string;
  phone: string;
  email: string | null;
  attendance_status: string;
  rsvp_status: RsvpStatus;
  seats_requested: number;
  note_to_celebrant: string | null;
  dietary_note: string | null;
  email_opt_in: boolean;
  confirmation_sent_at: string | null;
  reminder_sent_at: string | null;
  status_email_sent_at: string | null;
  check_in_email_sent_at: string | null;
  checked_in_at: string | null;
  checked_in_seats: number | null;
  checked_in_by_admin_id: string | null;
  checked_in_by: string | null;
  check_in_token: string;
  created_at: string;
  updated_at: string;
}

export interface DashboardSummary {
  total_allocated_seats: number;
  total_confirmed_seats: number;
  remaining_seats: number;
  total_rsvps: number;
  accepted_rsvps: number;
  declined_rsvps: number;
  waitlisted_rsvps: number;
  cancelled_rsvps: number;
  exhausted_trees: number;
  total_trees: number;
  checked_in_rsvps: number;
  checked_in_seats: number;
  confirmed_not_checked_in: number;
  check_in_rate: number;
}

export interface ReadinessItem {
  key: string;
  label: string;
  done: boolean;
  hint: string;
}

export interface EventReadiness {
  items: ReadinessItem[];
  completed: number;
  total: number;
}

export interface ManifestEntry {
  id: string;
  full_name: string;
  phone: string;
  email: string | null;
  invite_tree_id: string;
  invite_tree_name: string;
  rsvp_status: RsvpStatus;
  seats_requested: number;
  checked_in: boolean;
  checked_in_at: string | null;
  checked_in_seats: number | null;
  note_to_celebrant: string | null;
  dietary_note: string | null;
}

export interface ManifestTreeTotal {
  invite_tree_id: string;
  invite_tree_name: string;
  guests: number;
  confirmed_seats: number;
  checked_in_seats: number;
}

export interface GuestManifest {
  event_id: string;
  event_name: string;
  entries: ManifestEntry[];
  total_confirmed_seats: number;
  total_checked_in_seats: number;
  total_pending_seats: number;
  tree_totals: ManifestTreeTotal[];
}

export interface AuditLogEntry {
  id: string;
  created_at: string;
  admin_id: string | null;
  admin_email: string | null;
  admin_name: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  meta: Record<string, unknown>;
}

export interface AuditLogPage {
  items: AuditLogEntry[];
  total: number;
}

export interface DashboardCharts {
  seat_usage_by_tree: { tree: string; allocated: number; used: number; remaining: number }[];
  rsvp_status_breakdown: { status: string; count: number }[];
  rsvps_over_time: { date: string; count: number }[];
  capacity: { used: number; allocated: number };
}

// --- Guest communications (Phase 5) --- //
export type CommunicationStatus = "pending" | "sent" | "failed" | "skipped";

export interface EmailBackendStatus {
  backend: string;
  is_live_provider: boolean;
  configured: boolean;
  from_address: string;
  from_name: string;
}

export interface CommunicationLog {
  id: string;
  event_id: string;
  rsvp_id: string | null;
  communication_type: string;
  channel: string;
  recipient: string;
  provider: string;
  status: CommunicationStatus;
  provider_message_id: string | null;
  error_summary: string | null;
  // Human-readable, sanitized explanation of a skipped/failed outcome.
  reason: string | null;
  sent_at: string | null;
  created_at: string;
}

export interface CommunicationLogPage {
  items: CommunicationLog[];
  total: number;
}

export interface ReminderRecipient {
  full_name: string;
  email: string;
  seats_requested: number;
  checked_in: boolean;
}

export interface EmailPreview {
  subject: string;
  html: string;
  text: string;
}

export interface ReminderAudience {
  eligible_count: number;
  total_accepted: number;
  accepted_without_email: number;
  accepted_not_opted_in: number;
  checked_in_eligible: number;
  exclude_checked_in: boolean;
  last_reminder_sent_at: string | null;
  sample: ReminderRecipient[];
  preview: EmailPreview | null;
}

export interface CommunicationsStatus {
  event_id: string;
  event_name: string;
  email: EmailBackendStatus;
  host_notification_email: string;
  notify_tree_exhausted: boolean;
  notify_waitlisted_rsvp: boolean;
  eligible_reminder_count: number;
  last_reminder_sent_at: string | null;
  recent: CommunicationLog[];
}

export interface ReminderSendResult {
  sent: number;
  failed: number;
  skipped: number;
  message: string;
}

export interface NotifyResult {
  status: string;
  detail: string;
}

// --- Notification centre (Phase 7) --- //
export type NotificationSeverity = "info" | "success" | "warning" | "error";

export interface AdminNotification {
  id: string;
  event_id: string | null;
  notification_type: string;
  severity: NotificationSeverity;
  title: string;
  message: string;
  entity_type: string | null;
  entity_id: string | null;
  action_url: string | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
  event_name: string | null;
}

export interface NotificationPage {
  items: AdminNotification[];
  total: number;
  unread: number;
}

export interface UnreadCount {
  unread: number;
}

export interface MarkAllReadResult {
  updated: number;
}
