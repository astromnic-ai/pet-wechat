FROM node:20-alpine AS admin-deps
RUN corepack enable && corepack prepare pnpm@10.28.1 --activate
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/admin/package.json ./packages/admin/
RUN pnpm install --frozen-lockfile

FROM admin-deps AS admin-build
COPY packages/shared ./packages/shared
COPY packages/admin ./packages/admin
WORKDIR /app/packages/admin
RUN pnpm build

FROM oven/bun:1-alpine AS server-deps
WORKDIR /app
COPY packages/shared packages/shared
COPY packages/server/package.json packages/server/package.json
WORKDIR /app/packages/server
RUN sed -i 's/"shared": "workspace:\*"/"shared": "file:..\/shared"/' package.json && bun install

FROM oven/bun:1-alpine AS runtime
WORKDIR /app

COPY packages/shared packages/shared
COPY packages/server packages/server
COPY --from=server-deps /app/packages/server/node_modules packages/server/node_modules
COPY --from=admin-build /app/packages/admin/dist admin-dist

WORKDIR /app/packages/server

RUN sed -i 's/"shared": "workspace:\*"/"shared": "file:..\/shared"/' package.json

EXPOSE 9527

CMD ["bun", "run", "start"]
