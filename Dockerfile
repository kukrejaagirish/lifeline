FROM python:3.12-slim
WORKDIR /app
COPY server.py ./
COPY public ./public
RUN mkdir -p data && useradd -r -u 10001 lifeline && chown lifeline data
USER lifeline
EXPOSE 8787
VOLUME ["/app/data"]
HEALTHCHECK CMD python -c "import urllib.request;urllib.request.urlopen('http://127.0.0.1:8787/api/health',timeout=3)"
CMD ["python", "server.py", "--host", "0.0.0.0", "--port", "8787", "--no-sim"]
