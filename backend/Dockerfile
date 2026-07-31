# syntax=docker/dockerfile:1

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend/app ./backend/app
COPY content ./content

RUN addgroup --system --gid 1001 portfolio \
    && adduser --system --uid 1001 --ingroup portfolio --home /home/portfolio portfolio \
    && chown -R portfolio:portfolio /app

WORKDIR /app/backend
USER portfolio
EXPOSE 8000

CMD ["sh", "-c", "python -c 'import asyncio; from app.db import init_db; asyncio.run(init_db())' && exec gunicorn app.main:app --worker-class uvicorn.workers.UvicornWorker --workers 2 --bind 0.0.0.0:8000 --timeout 120 --access-logfile -"]
