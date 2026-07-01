import type { EventPublic } from "./types";

function toICSDate(iso: string): string {
  // YYYYMMDDTHHMMSSZ in UTC
  return new Date(iso).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

export function googleCalendarUrl(event: EventPublic): string | null {
  if (!event.event_date) return null;
  const start = new Date(event.event_date);
  const end = new Date(start.getTime() + 4 * 60 * 60 * 1000); // assume 4h
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title || event.name,
    dates: `${fmt(start)}/${fmt(end)}`,
    details: event.description,
    location: `${event.venue_name}, ${event.venue_address}`,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function downloadICS(event: EventPublic) {
  if (!event.event_date) return;
  const start = toICSDate(event.event_date);
  const end = toICSDate(
    new Date(new Date(event.event_date).getTime() + 4 * 60 * 60 * 1000).toISOString()
  );
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//RSVP60//EN",
    "BEGIN:VEVENT",
    `UID:${Date.now()}@rsvp60`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${event.title || event.name}`,
    `DESCRIPTION:${event.description.replace(/\n/g, " ")}`,
    `LOCATION:${event.venue_name}, ${event.venue_address}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "rsvp60-invite.ics";
  a.click();
  URL.revokeObjectURL(url);
}
