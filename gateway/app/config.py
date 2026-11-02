from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    gnani_speech_api_key: str = ""
    inya_platform_api_key: str = ""
    gateway_shared_secret: str = "dev-shared-secret-change-me"
    dashboard_token: str = "dev-dashboard-token-change-me"
    database_url: str = "postgresql+asyncpg://loanloop:loanloop@localhost:55432/loanloop"
    redis_url: str = "redis://localhost:56379/0"
    encryption_key: str = ""
    public_gateway_url: str = "http://localhost:8000"
    session_ttl_s: int = 1800


settings = Settings()
