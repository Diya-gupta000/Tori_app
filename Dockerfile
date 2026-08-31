FROM node:24.20.0-bookworm-slim
WORKDIR /app
RUN npm install --global pnpm@11.19.0
COPY . .
RUN pnpm install --frozen-lockfile
# Publishable, not secret. Never pass DATABASE_URL, Clerk secret or OpenAI key as build arguments.
ARG VITE_CLERK_PUBLISHABLE_KEY
ENV VITE_CLERK_PUBLISHABLE_KEY=$VITE_CLERK_PUBLISHABLE_KEY
RUN test -n "$VITE_CLERK_PUBLISHABLE_KEY" && BASE_PATH=/ pnpm run build:production
ENV NODE_ENV=production
USER node
CMD ["node", "--enable-source-maps", "artifacts/api-server/dist/index.mjs"]
