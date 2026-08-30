# Vibe Drinks - Instrucoes para AI Assistants

## Sobre o Projeto

Este e um sistema de delivery de bebidas premium (Vibe Drinks - Adega & Drinkeria) com:

- Catalogo de produtos com categorias
- Carrinho de compras com sistema de combos
- Sistema de pedidos com rastreamento em tempo real
- Painel administrativo completo
- Painel da cozinha para preparacao
- Painel do motoboy para entregas
- PDV (Ponto de Venda) para vendas no balcao

## Stack Tecnica

- React 18 + TypeScript
- Vite como bundler
- Tailwind CSS com tema dark (cores douradas)
- shadcn/ui + Radix UI para componentes
- React Router v6 para navegamento
- TanStack Query para gerenciamento de estado do servidor
- Supabase para backend (Database, Auth, Storage)

## Estrutura de Pastas

```
src/
├── components/       # Componentes reutilizaveis
│   ├── ui/          # Componentes shadcn/ui
│   ├── cart/        # Componentes do carrinho
│   ├── home/        # Componentes da home
│   └── layout/      # Header, Footer, etc
├── hooks/           # React hooks customizados
├── lib/             # Utilitarios e configuracoes
├── pages/           # Paginas/rotas da aplicacao
│   └── admin/       # Paginas administrativas
└── integrations/    # Integracoes externas
    └── supabase/    # Cliente e tipos Supabase
```

## Convencoes de Codigo

1. **Componentes:** Use functional components com hooks
2. **Tipos:** Use TypeScript estrito, defina interfaces para props
3. **Estilizacao:** Use classes Tailwind, evite CSS inline
4. **Estado:** Use TanStack Query para dados do servidor, useState/Context para UI
5. **Formularios:** Use react-hook-form com zod para validacao

## Tema e Design

- Tema dark como padrao
- Cor primaria: Gold (#FFD700)
- Background: Preto com gradientes sutis
- Efeitos glassmorphism nos cards
- Animacoes suaves com framer-motion

## Tabelas do Banco de Dados

As tabelas principais sao:
- users, addresses (usuarios)
- categories, products (catalogo)
- orders, order_items (pedidos)
- banners (promocoes)
- motoboys (entregadores)
- delivery_zones, neighborhoods (areas de entrega)
- settings (configuracoes)

## Comandos Uteis

```bash
npm run dev      # Servidor de desenvolvimento
npm run build    # Build para producao
npm run preview  # Preview do build
```
