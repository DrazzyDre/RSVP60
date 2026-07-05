"""Validate GatherArc email configuration in the TARGET environment.

Run from the backend/ directory with the real env vars set (e.g. in the Render
Shell) BEFORE relying on live delivery:

    python -m scripts.validate_email                       # read-only config check
    python -m scripts.validate_email --send-to me@you.com  # also send ONE test email

It:
  * shows the configured email backend and from-identity,
  * confirms required variables are present and EMAIL_FROM_ADDRESS is well-formed,
  * warns loudly when a production deploy is still on the ``console`` backend
    (emails are only logged, never delivered),
  * with ``--send-to``, sends exactly one clearly-labelled test email to the
    given approved recipient and prints the SAFE provider result,
  * prints only MASKED summaries — never the API key, auth header or raw
    provider response,
  * exits 0 on success, non-zero on a real misconfiguration or a failed test send.

No email is ever sent without an explicit ``--send-to`` recipient.
"""

import argparse
import re
import sys

from app.config import settings
from app.email.base import EmailMessage
from app.email.providers import get_provider

_EMAILISH = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _mask(value: str) -> str:
    return "<set>" if value else "<empty>"


def _print_summary() -> None:
    print("GatherArc email configuration check")
    print(f"  APP_ENV             = {settings.app_env}")
    print(f"  EMAIL_BACKEND       = {settings.email_backend_name}")
    print(f"  live provider       = {settings.is_email_provider_live}")
    print(f"  EMAIL_FROM_ADDRESS  = {settings.email_from_address or '<empty>'}")
    print(f"  EMAIL_FROM_NAME     = {settings.email_from_name or '<empty>'}")
    print(f"  RESEND_API_KEY      = {_mask(settings.resend_api_key)}")
    print(f"  EMAIL_TIMEOUT_SECS  = {settings.email_timeout_seconds}")


def _check_config() -> int:
    """Validate the configuration without sending. Returns an exit code."""
    backend = settings.email_backend_name

    if not settings.is_email_provider_live:
        # console/log backend: valid, but delivers nothing.
        if settings.is_production:
            print(
                "\nWARNING: EMAIL_BACKEND is 'console' in PRODUCTION — confirmation "
                "and reminder emails are only LOGGED, never delivered. Set "
                "EMAIL_BACKEND=resend (with RESEND_API_KEY + a verified "
                "EMAIL_FROM_ADDRESS) and redeploy to send real email."
            )
        else:
            print(
                "\nNote: console backend — emails are logged, not delivered. This "
                "is the expected default for local dev and tests."
            )
        return 0

    # Live provider (resend): require its credentials + a valid from-address.
    problems = []
    if backend == "resend" and not settings.resend_api_key:
        problems.append("RESEND_API_KEY is missing (server-only secret).")
    if not settings.email_from_address:
        problems.append("EMAIL_FROM_ADDRESS is missing.")
    elif not _EMAILISH.match(settings.email_from_address.strip()):
        problems.append(
            f"EMAIL_FROM_ADDRESS is not a valid email address: "
            f"{settings.email_from_address!r}"
        )
    if problems:
        print("\nFAIL: email provider is not fully configured:")
        for p in problems:
            print(f"  - {p}")
        return 1

    print(
        f"\nOK: '{backend}' backend is configured. The sender address/domain must "
        "also be VERIFIED with the provider for delivery to succeed."
    )
    return 0


def _send_test(recipient: str) -> int:
    if not _EMAILISH.match(recipient.strip()):
        print(f"\nFAIL: --send-to is not a valid email address: {recipient!r}")
        return 1
    provider = get_provider()
    print(f"\nSending ONE test email via '{provider.name}' to {recipient} ...")
    message = EmailMessage(
        to=recipient.strip(),
        subject="GatherArc email configuration test",
        html=(
            "<p>This is a GatherArc configuration test email. If you received it, "
            "live email delivery is working.</p>"
        ),
        text=(
            "This is a GatherArc configuration test email. If you received it, "
            "live email delivery is working."
        ),
    )
    result = provider.send(message)
    print(f"  status              = {result.status}")
    print(f"  provider            = {result.provider}")
    if result.provider_message_id:
        print(f"  provider_message_id = {result.provider_message_id}")
    if result.error_summary:
        print(f"  reason              = {result.error_summary}")
    if result.ok:
        print("\nOK: provider accepted the message. Check the inbox (and spam).")
        return 0
    print("\nFAIL: provider did not accept the message (see reason above).")
    return 1


def run(send_to: str | None = None) -> int:
    _print_summary()
    code = _check_config()
    if code != 0:
        return code
    if send_to:
        return _send_test(send_to)
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Validate GatherArc email configuration."
    )
    parser.add_argument(
        "--send-to",
        default=None,
        metavar="EMAIL",
        help="Send exactly one clearly-labelled test email to this recipient.",
    )
    args = parser.parse_args()
    return run(send_to=args.send_to)


if __name__ == "__main__":
    sys.exit(main())
