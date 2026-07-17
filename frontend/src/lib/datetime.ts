// Shared date/time serialization for admin forms.
//
// The event create/edit flow, the duplication dialog and the guided setup
// wizard all move values between an <input type="datetime-local"> (local time)
// and the backend's ISO-8601 (UTC) representation. Keeping ONE implementation
// here prevents the create form and the wizard from drifting into subtly
// different timezone handling.

/** ISO (UTC) string -> value for <input type="datetime-local"> in local time. */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const tzOffset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
}

/** <input type="datetime-local"> value (local) -> ISO (UTC) string, or null. */
export function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}
