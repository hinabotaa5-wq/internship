FROM public.ecr.aws/docker/library/python:3.12.3-slim-bookworm

ENV LANG C.UTF-8
ENV TZ Asia/Tokyo

WORKDIR /app

RUN apt-get update && apt-get install -y \
    curl \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

RUN curl -sSf https://rye.astral.sh/get | RYE_VERSION="0.35.0" RYE_INSTALL_OPTION="--yes" bash

COPY . .

RUN /root/.rye/shims/rye sync --no-dev

CMD ["/bin/bash", "/app/docker-images/entrypoint.sh"]
