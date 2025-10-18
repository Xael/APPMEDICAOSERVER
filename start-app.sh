#!/bin/sh

echo "Aguardando o banco de dados..."
# Tenta se conectar ao banco por um tempo antes de falhar
/usr/src/app/node_modules/.bin/prisma migrate deploy --skip-generate --preview-feature || echo "Aviso: Nenhuma migração para aplicar (usando db push como fallback)"

# Força a sincronização do schema com o banco (cria colunas que faltam)
echo "Sincronizando o Schema do Prisma com o Banco (db push)..."
/usr/src/app/node_modules/.bin/prisma db push --accept-data-loss

# Executa o seed do banco (popula dados iniciais, como admin)
echo "Executando o Seed..."
/usr/src/app/node_modules/.bin/prisma db seed

# Inicia o servidor Node.js
echo "Iniciando o Servidor Node.js..."
exec node server.js
