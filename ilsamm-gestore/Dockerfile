FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app
COPY . /app

EXPOSE 8080

CMD ["sh", "-c", "mkdir -p /data && if [ ! -f /data/gestore_data.sqlite3 ] && [ -f /app/data/gestore_data.sqlite3 ]; then cp /app/data/gestore_data.sqlite3 /data/gestore_data.sqlite3; fi && python3 /app/app/backend/server.py --host 0.0.0.0 --port 8080"]
