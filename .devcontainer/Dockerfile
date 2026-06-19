FROM python:3.12.3-slim-bookworm

ENV LANG C.UTF-8
ENV TZ Asia/Tokyo

WORKDIR /app

RUN apt update && apt-get install -y git gcc curl gpg default-mysql-client

# Claude Code のインストール(公式 apt リポジトリ。Bedrock 経由で利用する)。
# 公式の推奨はネイティブインストールで、Debian では署名付き apt リポジトリが提供されている。
# (npm グローバルインストールは代替手段。コンテナではバージョン固定しやすい apt を採用)
# 参照: https://code.claude.com/docs/ja/setup
# GPGキー fingerprint: 31DD DE24 DDFA B679 F42D 7BD2 BAA9 29FF 1A7E CACE
RUN install -d -m 0755 /etc/apt/keyrings \
  && curl -fsSL https://downloads.claude.ai/keys/claude-code.asc -o /etc/apt/keyrings/claude-code.asc \
  && echo "deb [signed-by=/etc/apt/keyrings/claude-code.asc] https://downloads.claude.ai/claude-code/apt/stable stable main" \
  > /etc/apt/sources.list.d/claude-code.list \
  && apt-get update \
  && apt-get install -y claude-code

# watchexec (ファイル変更を監視して再起動するツール) のインストール
RUN curl -L --proto '=https' --tlsv1.2 -sSf https://raw.githubusercontent.com/cargo-bins/cargo-binstall/main/install-from-binstall-release.sh | bash
RUN ~/.cargo/bin/cargo-binstall -y watchexec-cli --version 2.1.2

RUN curl -sSf https://rye.astral.sh/get | RYE_VERSION="0.35.0" RYE_INSTALL_OPTION="--yes" bash

RUN echo "source /usr/share/bash-completion/completions/git" >> ~/.bashrc
RUN echo "source /root/.rye/env" >> ~/.bashrc

CMD ["/bin/bash", "/app/.devcontainer/entrypoint.sh"]
