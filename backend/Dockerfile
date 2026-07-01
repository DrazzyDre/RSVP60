# RSVP60 FastAPI backend image
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Install dependencies first for better layer caching.
COPY requirements.txt .
RUN pip install -r requirements.txt

# App source (migrations, app package, alembic.ini, ...).
COPY . .

EXPOSE 8010

# Default command runs the API. In docker-compose we override this to run
# `alembic upgrade head` first (migrations are the source of truth in prod).
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8010"]
