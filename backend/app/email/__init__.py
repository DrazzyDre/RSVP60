"""Provider-agnostic transactional email for RSVP60.

Nothing outside this package imports a specific vendor. Routers call the
high-level functions in :mod:`app.email.service`; the concrete provider is
chosen from configuration by :func:`app.email.providers.get_provider`.
"""
