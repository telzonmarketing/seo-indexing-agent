from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # App
    APP_NAME: str = "SEO OS"
    DEBUG: bool = False
    SECRET_KEY: str = "change-me-in-production-use-256-bit-key"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # 24h

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://seo:seopass@localhost:5432/seoos"
    DATABASE_URL_SYNC: str = "postgresql://seo:seopass@localhost:5432/seoos"

    # Redis / Celery
    REDIS_URL: str = "redis://localhost:6379/0"
    CELERY_BROKER_URL: str = "redis://localhost:6379/0"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/1"

    # Qdrant
    QDRANT_HOST: str = "localhost"
    QDRANT_PORT: int = 6333

    # Ollama (local AI)
    OLLAMA_HOST: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "deepseek-r1:8b"
    OLLAMA_EMBED_MODEL: str = "nomic-embed-text"

    # Google OAuth
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_REDIRECT_URI: str = "http://localhost:8000/api/integrations/google/callback"

    # Crawler
    CRAWLER_MAX_PAGES: int = 500
    CRAWLER_DELAY_MS: int = 300
    CRAWLER_TIMEOUT_SECONDS: int = 30
    CRAWLER_CONCURRENT: int = 5

    # Optional OpenAI fallback
    OPENAI_API_KEY: str = ""

    class Config:
        env_file = ".env"
        case_sensitive = True


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
