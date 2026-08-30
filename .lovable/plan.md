# Baixa de estoque completa nos pedidos do iFood

## Problema

O botão **Sincronizar Estoque** nos cards de pedidos do iFood abre um modal que só mostra **produtos fabricados** (`is_prepared = true`). Por isso quase nada do catálogo aparece. Você precisa dar baixa de **qualquer produto** (fabricados e industrializados) e também das **doses de garrafas abertas** usadas nos drinks. Além disso, depois de confirmada a baixa, o card precisa de um indicador claro **no título** para o responsável pelo estoque identificar rapidamente.

## O que vai mudar

Cada item do pedido do iFood passa a poder ser vinculado a:
- **Qualquer produto** do catálogo (busca por nome, mostrando estoque atual), ou
- **Uma garrafa aberta** (open_bottle), informando quantas **doses** baixar, ou
- **Ignorado** (sem baixa).

A quantidade continua em **números inteiros** (unidades de produto ou nº de doses).

```text
┌─ Item do iFood: "CAIPIRINHA DE LIMÃO" ───────────────┐
│ Tipo:  ( • ) Produto   ( ) Dose de garrafa   [Ignorar]│
│ Alvo:  [ Buscar produto/garrafa...        ▼ ] Qtd:[2] │
│        sugestão: CAIPIRINHA (aprendido)               │
└──────────────────────────────────────────────────────┘
```

Itens sem correspondência ficam destacados em amarelo até serem resolvidos ou ignorados. Tela de revisão antes de confirmar (igual hoje), agora separando "produtos" e "doses de garrafa". O aprendizado de alias (memória de "este texto = este produto") é mantido.

## Indicador "STOCK OK" no título do card

Hoje, quando a baixa já foi feita, aparece um aviso só na área de ações ("✅ ESTOQUE SINCRONIZADO..."). Vamos adicionar também um **selo verde compacto "✅ STOCK OK" no título/cabeçalho do card** do pedido iFood, visível sem expandir:

```text
#A1B2C3  iFood  [ENTREGUE]  ✅ STOCK OK
```

- Aparece apenas em pedidos externos `delivered` que já têm registro em `get_ifood_sync_status` (reaproveita o `syncStatusMap` já existente em `OrdersTab.tsx`).
- Cor verde, com tooltip mostrando quem sincronizou e quando.
- Pedidos entregues ainda **sem** baixa continuam com o botão vermelho pulsante "⚠ SINCRONIZAR COM ESTOQUE".

## Passos técnicos

### 1. Banco — atualizar funções
- **`suggest_product_for_ifood_item`**: remover o filtro `is_prepared = true` para sugerir qualquer produto por alias/nome/fuzzy.
- **`sync_ifood_order_stock`**: aceitar em cada item um campo `target_type` (`'product'` | `'bottle'`):
  - `product`: remover a regra que exige `is_prepared` e baixar `products.stock` via `deduct_product_stock` (GREATEST(0, ...)).
  - `bottle`: baixar doses via `deduct_bottle_doses(p_bottle_id, p_doses)`.
  - Registrar tudo em `stock_sync_log`, mantendo a sentinela de idempotência e o aprendizado de alias.
  - Retorno passa a informar `synced_products`, `synced_bottles`, `total_units`.

### 2. Frontend — `IfoodStockSyncWizard.tsx`
- Carregar **todos** os produtos (`products: id, name, stock`, sem filtro `is_prepared`, ordenados por nome).
- Carregar **garrafas abertas** não vazias (`open_bottles: id, product_name, remaining_doses, ml_per_dose`).
- Em cada linha, adicionar seletor de **tipo** (Produto / Dose de garrafa) e um combobox de busca que lista a fonte escolhida, mostrando estoque/doses restantes.
- Enviar `target_type` no payload do RPC e tratar o novo retorno no toast.
- Invalidar queries (`products`, `open-bottles`, `ifood-sync-status`, `admin-orders`).

### 3. Frontend — `OrdersTab.tsx`
- No cabeçalho/título do card de pedidos iFood, renderizar o selo **"✅ STOCK OK"** quando houver entrada em `syncStatusMap` para o pedido, com tooltip de quem/quando.

### 4. Regenerar tipos
Após a migração, os tipos do Supabase são regenerados e o componente usa a nova assinatura do RPC.

## Observações
- Idempotência (pedido só sincroniza uma vez) e o badge piscante de pendência permanecem.
- Nada muda no fluxo de pedidos normais/PDV — apenas o wizard de baixa manual do iFood é ampliado.
