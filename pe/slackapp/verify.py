"""Slack request signing (v0). Rejects bad signatures and requests older than 5 minutes."""
import hashlib
import hmac
import time

MAX_SKEW_SECONDS = 300


def verify(signing_secret, headers, body, now=None):
    ts = headers.get("X-Slack-Request-Timestamp", "")
    sig = headers.get("X-Slack-Signature", "")
    if not ts.isdigit() or not sig.startswith("v0="):
        return False
    if abs((now or time.time()) - int(ts)) > MAX_SKEW_SECONDS:
        return False
    base = f"v0:{ts}:{body}".encode()
    expected = "v0=" + hmac.new(signing_secret.encode(), base, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, sig)


def sign(signing_secret, body, ts):
    """Used by tests to build valid requests."""
    return "v0=" + hmac.new(signing_secret.encode(), f"v0:{ts}:{body}".encode(), hashlib.sha256).hexdigest()
