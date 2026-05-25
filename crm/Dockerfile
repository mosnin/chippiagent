# Minimal Dockerfile for the Next.js CRM (mosnin/realestatecrm).
# Defaults to `pnpm dev` so the dev experience matches `next dev --turbopack`
# from package.json. For a production image, swap CMD to `pnpm start` and
# add a `pnpm build` step.
FROM node:22-alpine

# pnpm is pinned by package.json's `packageManager` field, so corepack
# will fetch the exact version on first invocation.
RUN corepack enable

WORKDIR /app

# Copy manifests first so `pnpm install` caches when source changes.
COPY package.json pnpm-lock.yaml ./

# Skip lifecycle scripts that need native toolchains we don't ship in
# alpine; runtime-relevant ones are listed in package.json's
# `pnpm.onlyBuiltDependencies` and are built on demand.
RUN pnpm install --frozen-lockfile

# Source. Live-mounted in docker-compose so edits hot-reload.
COPY . .

EXPOSE 3000

CMD ["pnpm", "dev"]
