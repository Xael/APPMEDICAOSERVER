# Backend do CRB Serviços

Este é o servidor backend para a aplicação CRB Serviços. Ele é construído com Node.js, Express e Prisma ORM para interagir com um banco de dados PostgreSQL.

## Pré-requisitos

-   [Node.js](https://nodejs.org/) (versão 18 ou superior)
-   [npm](https://www.npmjs.com/) ou [yarn](https://yarnpkg.com/)
-   Um banco de dados PostgreSQL em execução e acessível.

## 1. Configuração do Projeto

1.  **Navegue até a pasta do servidor:**
    ```bash
    cd server
    ```

2.  **Instale as dependências:**
    ```bash
    npm install
    ```

3.  **Crie o arquivo de ambiente:**
    Copie o arquivo `.env.example` para um novo arquivo chamado `.env`.
    ```bash
    cp .env.example .env
    ```

4.  **Configure as variáveis de ambiente:**
    Abra o arquivo `.env` e preencha as variáveis:
    -   `DATABASE_URL`: A string de conexão completa para o seu banco de dados PostgreSQL.
    -   `JWT_SECRET`: Uma chave secreta longa e aleatória para assinar os tokens de autenticação.

## 2. Configuração do Banco de Dados

O Prisma usa o arquivo `prisma/schema.prisma` para definir a estrutura do seu banco de dados.

1.  **Execute a migração do banco de dados:**
    Este comando irá ler o `schema.prisma`, criar as tabelas correspondentes no seu banco de dados PostgreSQL e criar o primeiro registro de migração.
    ```bash
    npx prisma migrate dev --name init
    ```
    *Nota: Se for solicitado, confirme a criação do banco de dados se ele ainda não existir.*

2.  **Gere o Cliente Prisma:**
    Após a migração, gere o cliente Prisma que será usado no código para interagir com o banco de dados.
    ```bash
    npx prisma generate
    ```

## 3. Executando o Servidor

-   **Para desenvolvimento (com recarregamento automático):**
    ```bash
    npm run dev
    ```
    O servidor será iniciado, e o `nodemon` irá reiniciá-lo automaticamente sempre que um arquivo for alterado.

-   **Para produção:**
    ```bash
    npm start
    ```
    O servidor será iniciado usando `node`.

Por padrão, o servidor rodará em `http://localhost:8000`.

## Estrutura da API

O servidor expõe os seguintes endpoints principais:

-   `/api/auth`: Autenticação de usuários (login, obter dados do usuário).
-   `/api/records`: Gerenciamento dos registros de serviço (CRUD e upload de fotos).
-   `/api/locations`: Gerenciamento dos locais (CRUD).
-   `/api/users`: Gerenciamento de usuários (CRUD).
-   `/api/services`: Gerenciamento dos tipos de serviço (CRUD).
-   `/api/goals`: Gerenciamento das metas (CRUD).
-   `/api/audit-log`: Visualização do log de auditoria.

## Upload de Fotos

As fotos enviadas são salvas na pasta `server/uploads/` e podem ser acessadas através da URL `http://localhost:8000/uploads/nome-do-arquivo.jpg`.
