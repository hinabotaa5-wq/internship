FROM public.ecr.aws/docker/library/python:3.12.3-slim-bookworm

ENV LANG C.UTF-8
ENV TZ Asia/Tokyo

WORKDIR /app

RUN apt-get update && apt-get install -y \
    curl \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:${PATH}"

COPY . .

RUN uv pip sync --system requirements.lock

CMD ["/bin/bash", "/app/docker-images/entrypoint.sh"]
