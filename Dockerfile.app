FROM node:22-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    bash \
    ca-certificates \
    g++ \
    openjdk-17-jdk-headless \
    python3 \
  && rm -rf /var/lib/apt/lists/*

RUN ln -sf /usr/bin/python3 /usr/local/bin/python

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY . .

ARG ACMCODER_BUILD_COMMIT=unknown
RUN ACMCODER_BUILD_COMMIT=$ACMCODER_BUILD_COMMIT node scripts/build-clients.mjs local-web

RUN mkdir -p /app/bundled-data/recommendation \
  && cp /app/data/recommendation/default-catalog.json /app/bundled-data/recommendation/default-catalog.json

ENV ACMCODER_HOST=0.0.0.0
ENV ACMCODER_DEPLOYMENT_MODE=docker-app
ENV ACMCODER_BUNDLED_RECOMMENDATION_CATALOG_FILE=/app/bundled-data/recommendation/default-catalog.json
ENV PORT=43117

EXPOSE 43117

CMD ["node", "bin/acmcoder.js", "serve", "--port", "43117"]
