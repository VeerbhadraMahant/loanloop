import logging

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    gnani_speech_api_key: str = ""
    inya_platform_api_key: str = ""
    gateway_shared_secret: str = "dev-shared-secret-change-me"
    dashboard_token: str = "dev-dashboard-token-change-me"
    phone_token: str = "dev-phone-token-change-me"  # mock phone app only; the dashboard token must not open /phone
    database_url: str = "postgresql+asyncpg://loanloop:loanloop@localhost:55432/loanloop"
    redis_url: str = "redis://localhost:56379/0"
    encryption_key: str = ""
    public_gateway_url: str = "http://localhost:8000"
    session_ttl_s: int = 1800
    jobs_interval_s: int = 3600  # cron-style jobs loop; 0 disables (tests)


DEV_DEFAULTS = {"gateway_shared_secret": "dev-shared-secret-change-me", "dashboard_token": "dev-dashboard-token-change-me",
                "phone_token": "dev-phone-token-change-me"}

settings = Settings()


def check_settings(s: Settings = settings) -> None:
    """Startup check: refuse to run without an encryption key; shout if dev default secrets are in use."""
    if not s.encryption_key:
        raise RuntimeError("ENCRYPTION_KEY is empty: refusing to start")
    for name, default in DEV_DEFAULTS.items():
        if not getattr(s, name):  # an empty token would accept a bare "Bearer "
            raise RuntimeError(f"{name.upper()} is empty: refusing to start")
        if getattr(s, name) == default:
            # the defaults are in the public repo: never accept them on a publicly reachable gateway
            if not s.public_gateway_url.startswith(("http://localhost", "http://127.0.0.1")):
                raise RuntimeError(f"{name.upper()} is the dev default but PUBLIC_GATEWAY_URL is public: refusing to start")
            logging.getLogger("config").warning("SECURITY: %s is the dev default. Change it before exposing the gateway.", name.upper())
