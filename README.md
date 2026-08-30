# Vibe Drinks - Adega & Drinkeria

Sistema de delivery de bebidas premium com painel administrativo completo.

## Tecnologias

- **Frontend:** React 18 + TypeScript
- **Build:** Vite
- **Styling:** Tailwind CSS
- **UI Components:** Radix UI + shadcn/ui
- **Routing:** React Router v6
- **State:** TanStack Query + React Context
- **Backend:** Supabase (Database, Auth, Storage)

## Setup

### 1. Clone e instale as dependencias

```bash
git clone <seu-repositorio>
cd vibe-drinks
npm install
```

### 2. Configure as variaveis de ambiente

Copie o arquivo `.env.example` para `.env` e preencha com suas credenciais do Supabase:

```bash
cp .env.example .env
```

Edite o arquivo `.env`:

```
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-anon-key
```

### 3. Configure o Supabase

O projeto utiliza as seguintes tabelas no Supabase:

- `users` - Usuarios e autenticacao
- `addresses` - Enderecos dos usuarios
- `categories` - Categorias de produtos
- `products` - Produtos do catalogo
- `orders` - Pedidos
- `order_items` - Itens dos pedidos
- `banners` - Banners do carrossel
- `motoboys` - Entregadores
- `delivery_zones` - Zonas de entrega
- `neighborhoods` - Bairros
- `settings` - Configuracoes da loja

Consulte o arquivo `src/integrations/supabase/types.ts` para ver a estrutura completa das tabelas.

### 4. Inicie o servidor de desenvolvimento

```bash
npm run dev
```

O aplicativo estara disponivel em `http://localhost:5173`

## Paginas

- `/` - Pagina inicial com catalogo de produtos
- `/login` - Login de clientes
- `/admin-login` - Login administrativo
- `/checkout` - Finalizacao de pedido
- `/pedidos` - Historico de pedidos do cliente
- `/perfil` - Perfil do usuario
- `/cozinha` - Painel da cozinha
- `/motoboy` - Painel do motoboy
- `/pdv` - Ponto de venda
- `/admin` - Dashboard administrativo

## Build para producao

```bash
npm run build
```

Os arquivos de producao serao gerados na pasta `dist/`.

## Deploy

O projeto pode ser deployado em:

- **Vercel** - Configuracao automatica para projetos Vite
- **Netlify** - Configuracao automatica para projetos Vite
- **Supabase Edge Functions** - Para funcoes serverless adicionais

## Adaptacao para Lovable

Este projeto foi adaptado de uma estrutura Express + React para funcionar puramente no frontend com Supabase. As principais mudancas foram:

1. Remocao do backend Express
2. Migracao de `wouter` para `react-router-dom`
3. Integracao direta com Supabase no frontend
4. Reestruturacao de pastas para padrao Lovable

## Notas para o desenvolvedor

- O tema e dark-first com cores douradas (gold accent)
- Todos os componentes UI estao em `src/components/ui/`
- Os hooks customizados estao em `src/hooks/`
- As paginas estao em `src/pages/`
- Os tipos do Supabase estao em `src/integrations/supabase/types.ts`

## Suporte

Para duvidas ou problemas, entre em contato com a equipe de desenvolvimento.
