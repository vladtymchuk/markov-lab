FROM python:3.13-slim
ENV PYTHONUNBUFFERED=1 UV_NO_CACHE=1 PATH="/srv/api/.venv/bin:$PATH"     OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 EXAMPLES_DIR=/srv/examples
WORKDIR /srv/api
RUN apt-get update && apt-get install -y --no-install-recommends fonts-dejavu-core     && rm -rf /var/lib/apt/lists/*     && pip install --no-cache-dir uv==0.13.9
COPY apps/api/pyproject.toml apps/api/uv.lock ./
RUN uv sync --locked --no-dev
COPY apps/api/markov_lab markov_lab
COPY apps/api/alembic.ini ./
COPY apps/api/migrations migrations
COPY examples /srv/examples
RUN useradd --uid 10001 --no-create-home markov
USER 10001
EXPOSE 8000
CMD ["sh", "-c", "alembic upgrade head && exec uvicorn markov_lab.main:app --host 0.0.0.0 --port 8000"]
