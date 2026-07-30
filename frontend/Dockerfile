FROM node:22-alpine AS deps
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG VITE_API_URL
ARG VITE_CONTRACT_ADDRESS
ARG VITE_NETWORK
ARG VITE_SITE_URL
RUN pnpm build

FROM node:22-alpine AS runtime
WORKDIR /app
COPY --from=build /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/server/server.js"]
