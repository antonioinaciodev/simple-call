# Imagem única: API + front buildado, servidos pelo mesmo processo Node.
FROM node:22-alpine
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY apps/server/package.json apps/server/
RUN pnpm install --frozen-lockfile
COPY apps apps
RUN pnpm build && pnpm prune --prod
ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "apps/server/dist/index.js"]
