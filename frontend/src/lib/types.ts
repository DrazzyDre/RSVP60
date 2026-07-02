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
  tree_count: number;
  rsvp_count: number;
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

export interface DashboardCharts {
  seat_usage_by_tree: { tree: string; allocated: number; used: number; remaining: number }[];
  rsvp_status_breakdown: { status: string; count: number }[];
  rsvps_over_time: { date: string; count: number }[];
  capacity: { used: number; allocated: number };
}
