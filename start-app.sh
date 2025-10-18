#!/bin/sh

# Caminho absoluto para o binário do Prisma (garante que seja encontrado)
PRISMA_BIN="./node_modules/.bin/prisma"

# 1. Espera pelo Banco de Dados estar pronto para conexões Prisma
# Isso é crucial para ambientes orquestrados onde o healthcheck pode ser otimista.
echo "Aguardando o Banco de Dados (DB) antes da migração..."
sleep 5 # Dá um tempo extra para o PostgreSQL estar pronto para conexões de alto nível.

# 2. Força a sincronização do schema com o banco (cria colunas que faltam)
# O `db push` é usado para garantir que o banco reflita o schema.prisma.
echo "Forçando Sincronização do Schema (db push)..."
$PRISMA_BIN db push --accept-data-loss || { 
  echo "ERRO CRÍTICO: db push falhou. Verifique DATABASE_URL e logs do DB."
  exit 1
}

# 3. Executa o seed do banco (popula dados iniciais, como admin)
echo "Executando o Seed..."
$PRISMA_BIN db seed || { 
  echo "Aviso: db seed falhou (pode ser esperado se o seed já rodou)."
  # Não vamos falhar aqui, mas é bom logar.
}

# 4. Inicia o servidor Node.js
echo "Iniciando o Servidor Node.js..."
exec node server.js
