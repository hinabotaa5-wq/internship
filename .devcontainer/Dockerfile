FROM python:3.12.3-slim-bookworm

ENV LANG C.UTF-8
ENV TZ Asia/Tokyo

WORKDIR /app

RUN apt update && apt-get install -y git gcc curl default-mysql-client

# watchexec (ファイル変更を監視して再起動するツール) のインストール
RUN curl -L --proto '=https' --tlsv1.2 -sSf https://raw.githubusercontent.com/cargo-bins/cargo-binstall/main/install-from-binstall-release.sh | bash
RUN ~/.cargo/bin/cargo-binstall -y watchexec-cli --version 2.1.2

RUN curl -sSf https://rye.astral.sh/get | RYE_VERSION="0.35.0" RYE_INSTALL_OPTION="--yes" bash

RUN echo "source /usr/share/bash-completion/completions/git" >> ~/.bashrc
RUN echo "source /root/.rye/env" >> ~/.bashrc

CMD ["/bin/bash", "/app/.devcontainer/entrypoint.sh"]
