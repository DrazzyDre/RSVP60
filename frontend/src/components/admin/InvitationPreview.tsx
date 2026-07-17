"use client";

import * as React from "react";
import { useState } from "react";
import { Monitor, Smartphone } from "lucide-react";
import { resolveMediaUrl } from "@/lib/api";
import type {
  BackgroundPreset,
  EventAdmin,
  EventPublic,
  InvitePublic,
  ThemePreset,
} from "@/lib/types";
import { getInviteTheme } from "@/lib/theme";
import { resolveTemplate } from "@/lib/invitation-templates";
import { cn } from "@/lib/utils";

type Device = "desktop" | "mobile";

/**
 * Non-interactive live preview of the currently selected template using the
 * event's real content (with tasteful neutral placeholders only for empty core
 * fields, applied here — never on the public page). Renders one resolved
 * template in `preview` mode (no live RSVP, no API). A device toggle narrows the
 * frame; the actual public invitation is fully responsive.
 */
export function InvitationPreview({
  event,
  templateId,
  accentColor,
  background,
}: {
  event: EventAdmin;
  templateId: ThemePreset;
  accentColor: string;
  background: BackgroundPreset;
}) {
  const [device, setDevice] = useState<Device>("desktop");

  const { event: previewEvent, invite } = buildPreviewData(
    event,
    templateId,
    accentColor,
    background
  );
  const theme = getInviteTheme(templateId, accentColor, background);
  const flyerUrl = resolveMediaUrl(previewEvent.flyer_image_url);
  const Render = resolveTemplate(templateId).Render;

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-royal">Live preview</p>
        <div className="inline-flex rounded-lg border border-input p-0.5" role="group" aria-label="Preview device">
          <DeviceButton
            active={device === "desktop"}
            onClick={() => setDevice("desktop")}
            icon={<Monitor className="h-4 w-4" />}
            label="Desktop"
          />
          <DeviceButton
            active={device === "mobile"}
            onClick={() => setDevice("mobile")}
            icon={<Smartphone className="h-4 w-4" />}
            label="Mobile"
          />
        </div>
      </div>

      <div className="mt-2 overflow-hidden rounded-xl border">
        <div
          className="max-h-[520px] overflow-y-auto overflow-x-auto"
          style={{ background: theme.pageBackground }}
        >
          <div
            aria-hidden
            className={cn(
              "pointer-events-none",
              device === "mobile" && "mx-auto w-[390px] max-w-full"
            )}
          >
            <Render
              event={previewEvent}
              invite={invite}
              token="preview"
              theme={theme}
              flyerUrl={flyerUrl}
              submitted={false}
              onSubmitted={() => {}}
              preview
            />
          </div>
        </div>
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">
        Preview uses this event’s content; empty fields show neutral placeholders.
        The live invitation is fully responsive.
      </p>
    </div>
  );
}

function DeviceButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
        active ? "bg-royal text-white" : "text-muted-foreground hover:bg-muted"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

// Map an admin event to the public template contract, filling tasteful neutral
// placeholders for empty CORE fields so the admin preview never looks broken.
// Optional fields left empty simply stay hidden (as on the real invitation).
function buildPreviewData(
  event: EventAdmin,
  templateId: ThemePreset,
  accentColor: string,
  background: BackgroundPreset
): { event: EventPublic; invite: InvitePublic } {
  const previewEvent: EventPublic = {
    name: event.name || "Your event",
    event_type: event.event_type,
    host_or_celebrant_name: event.host_or_celebrant_name || event.name || "The Celebrant",
    title: event.title || "",
    invite_headline: event.invite_headline || "You are invited",
    invite_message:
      event.invite_message ||
      event.description ||
      "Your warm invitation message will appear here for guests to read.",
    description: event.description || "",
    event_date: event.event_date,
    event_time: event.event_time || "",
    venue_name: event.venue_name || "Venue to be announced",
    venue_address: event.venue_address || "",
    maps_url: event.maps_url || "",
    dress_code: event.dress_code || "",
    gift_details: event.gift_details || "",
    contact_phone: event.contact_phone || "",
    flyer_url: event.flyer_url || "",
    flyer_image_url: event.flyer_image_url || "",
    rsvp_deadline: event.rsvp_deadline,
    theme_preset: templateId,
    accent_color: accentColor,
    background_preset: background,
  };
  const invite: InvitePublic = {
    event: previewEvent,
    accepting_rsvps: true,
    plus_one_allowed: 1,
    seat_options: [1, 2],
    existing_rsvp: null,
  };
  return { event: previewEvent, invite };
}
