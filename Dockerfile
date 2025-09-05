# -------- BACKEND (Node + Prisma) --------
FROM node:18-bullseye-slim

WORKDIR /app

# libs necessárias pro Prisma/openssl
RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

# cache de deps
COPY package*.json ./
RUN npm install --omit=dev

# copie prisma antes para gerar client
COPY prisma ./prisma
RUN npx prisma generate

# copie o restante do código
COPY . .

ENV NODE_ENV=production
# DATABASE_URL e variáveis vêm do EasyPanel

# Em runtime: aplica migrações e roda o seed (idempotente), depois sobe o server
CMD sh -c "npx prisma migrate deploy && npx prisma db seed && node server.js"
