FROM node:22-bookworm-slim AS build
ENV NEXT_TELEMETRY_DISABLED=1
ARG API_ORIGIN=http://api:8000
ENV API_ORIGIN=$API_ORIGIN
WORKDIR /srv/apps/web
RUN npm install -g pnpm@10.33.3
COPY apps/web/package.json apps/web/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY apps/web ./
COPY packages/contracts /srv/packages/contracts
RUN pnpm build

FROM node:22-bookworm-slim
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
WORKDIR /srv/apps/web
COPY --from=build /srv/apps/web /srv/apps/web
USER node
EXPOSE 3000
CMD ["node", "node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0", "--port", "3000"]
