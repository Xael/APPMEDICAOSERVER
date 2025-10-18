# -------- BACKEND (Node + Prisma) --------
FROM node:18-bullseye-slim

# Define o diretório de trabalho dentro do contêiner
WORKDIR /app

# 1. Instala libs necessárias pro Prisma/openssl
RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

# 2. Copia e instala as dependências (sem as de desenvolvimento)
COPY package*.json ./
# Certifique-se de que o nodemailer está no package.json
RUN npm install --omit=dev

# 3. Copia o schema do Prisma e gera o Prisma Client
COPY prisma ./prisma
RUN npx prisma generate

# 4. Copia o restante do código da aplicação, incluindo o novo script
COPY . .

# Garante que o script seja executável
RUN chmod +x ./start-app.sh

# Variáveis de Ambiente e Porta
ENV NODE_ENV=production
# DATABASE_URL e outras variáveis vêm do EasyPanel via env_file

# 5. Comando de Inicialização (CMD)
# Usamos o script para garantir a sequência correta de migração/push, seed e start.
CMD ["./start-app.sh"]
