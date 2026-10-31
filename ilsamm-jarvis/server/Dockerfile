FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    JARVIS_DATA=/data \
    PORT=8080

# ffmpeg converte l'audio (microfono del browser, voce per i dispositivi);
# edge-tts dà la voce neurale (Diego). Tutto il resto è libreria standard di Python.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/* \
    && pip install --no-cache-dir "edge-tts>=6.1.10"

WORKDIR /app
COPY jarvis_server.py /app/jarvis_server.py
COPY public /app/public

VOLUME /data
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8080/api/ping', timeout=4).status == 200 else 1)"

CMD ["python", "/app/jarvis_server.py"]
