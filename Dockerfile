# Usa uma imagem Node.js leve baseada em Alpine
FROM node:18-alpine

# Define o diretório de trabalho dentro do contêiner
WORKDIR /usr/src/app

# Copia package.json e package-lock.json
COPY package*.json ./

# Instala as dependências de produção
RUN npm install --omit=dev

# Copia o schema do Prisma para gerar o cliente
COPY prisma ./prisma/

# Gera o cliente Prisma
RUN npx prisma generate

# Copia o resto do código do servidor
COPY . .

# Expõe a porta que o servidor usa
EXPOSE 8000

# Comando para iniciar o servidor (será pego pelo Supervisor do seu ambiente)
CMD ["npm", "start"]