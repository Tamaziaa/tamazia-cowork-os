# Tamazia crawl-render microservice — headless Chromium renderer for JS-SPA audit pages.
# Build:  docker build -t tamazia-crawl-render services/crawl-render
# Run:    docker run -p 8080:8080 --shm-size=1g tamazia-crawl-render
# Wire:   export CRAWL_RENDER_URL="http://<host>:8080/render"   (set in the engine's env)
FROM mcr.microsoft.com/playwright/python:v1.44.0-jammy

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
    && python -m playwright install --with-deps chromium

COPY app.py .

ENV RENDER_CONCURRENCY=4 \
    RENDER_TIMEOUT_MS=25000 \
    PORT=8080
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8080/healthz').status==200 else 1)"

CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT}"]
