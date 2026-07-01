"""Small shared helpers."""

import re


def normalize_phone(raw: str) -> str:
    """Normalize a phone number for storage and duplicate detection.

    Keeps a single leading ``+`` (country code intent) and strips every other
    non-digit character, so "+234 801-234 5678", "+2348012345678" and
    "+234 (801) 2345678" all collapse to the same value.
    """
    raw = (raw or "").strip()
    has_plus = raw.startswith("+")
    digits = re.sub(r"\D", "", raw)
    return ("+" + digits) if has_plus else digits
