# Imagem única: API + front buildado, servidos pelo mesmo processo Node.
FROM node:22-alpine
WORKDIR /app
RUN corepack enable
# Sem isso o pnpm pede confirmação (TTY) ao refazer o node_modules.
ENV CI=true
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY apps/server/package.json apps/server/
COPY tools/livekit/package.json tools/livekit/
RUN pnpm install --frozen-lockfile
COPY apps apps
# Depois do build, refaz o node_modules só com as dependências de produção.
RUN pnpm build && pnpm install --prod --frozen-lockfile
ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "apps/server/dist/index.js"]
