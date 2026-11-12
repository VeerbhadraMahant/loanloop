"""scrypt password / passcode hashing: scrypt$n$r$p$salt_b64$hash_b64 (stdlib only)."""
import base64
import hashlib
import hmac
import os

N, R, P = 2**14, 8, 1


def hash_secret(secret: str) -> str:
    salt = os.urandom(16)
    h = hashlib.scrypt(secret.encode(), salt=salt, n=N, r=R, p=P, dklen=32)
    return "scrypt$%d$%d$%d$%s$%s" % (N, R, P, base64.b64encode(salt).decode(), base64.b64encode(h).decode())


def verify_secret(secret: str, stored: str | None) -> bool:
    """Unknown identifier (stored=None) still burns one scrypt so timing does not reveal it. Never raises: a malformed hash is False."""
    try:
        _, n, r, p, salt, want = (stored or "").split("$")
        n, r, p = int(n), int(r), int(p)
        if not (0 < n <= 2**16 and 0 < r <= 16 and 0 < p <= 4):  # a tampered row must not make us allocate gigabytes
            raise ValueError
        salt_b, want_b = base64.b64decode(salt), base64.b64decode(want)
        stored_ok = True
    except (ValueError, TypeError):
        n, r, p, salt_b, want_b, stored_ok = N, R, P, bytes(1) * 16, b"", False
    try:
        got = hashlib.scrypt(secret.encode(), salt=salt_b, n=n, r=r, p=p, dklen=32)
    except (ValueError, TypeError):
        return False
    return stored_ok and hmac.compare_digest(got, want_b)
