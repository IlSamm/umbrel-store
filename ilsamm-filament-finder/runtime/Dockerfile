FROM public.ecr.aws/docker/library/python:3.13-slim AS builder

WORKDIR /src
COPY . /src
RUN python /src/ilsamm-filament-finder/runtime/build_runtime.py /src /opt/filament-finder

FROM public.ecr.aws/docker/library/python:3.13-slim

LABEL org.opencontainers.image.source="https://github.com/IlSamm/umbrel-store"
LABEL org.opencontainers.image.title="Filament Finder"
LABEL org.opencontainers.image.description="Filament Finder 10.2 for Umbrel"

WORKDIR /app
COPY --from=builder /opt/filament-finder /app

ENV TZ=Europe/Rome \
    FILAMENT_FINDER_PORT=8765 \
    FILAMENT_FINDER_DATA_DIR=/data \
    FILAMENT_FINDER_CACHE_TTL=900 \
    FILAMENT_FINDER_MONITOR_INTERVAL=900 \
    PYTHONUNBUFFERED=1

VOLUME ["/data"]
EXPOSE 8765

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=5 CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8765/api/sources', timeout=3).read()" || exit 1

CMD ["python", "-u", "server.py"]
