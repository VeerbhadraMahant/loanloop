from cryptography.fernet import Fernet

from app.config import settings

_f: Fernet | None = None


def _fernet() -> Fernet:
    global _f
    if _f is None:
        _f = Fernet(settings.encryption_key.encode())
    return _f


def encrypt(s: str) -> str:
    return _fernet().encrypt(s.encode()).decode()


def decrypt(s: str) -> str:
    return _fernet().decrypt(s.encode()).decode()
