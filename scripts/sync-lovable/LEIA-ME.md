# Sincronizar produtos e estoque: Lovable -> banco novo

O Lovable está em uso e o sistema novo está em manutenção. Os IDs dos produtos são iguais nos dois
bancos, então a sincronização é feita por ID e pode ser repetida quantas vezes precisar.

## O que atualiza
- **Produtos que já existem no novo:** estoque, custo, preço de venda e ativo/inativo.
- **Produtos que só existem no Lovable:** são criados no novo (com a categoria pelo nome).
- **Não mexe em:** nome, categoria, imagem e descrição dos produtos que já existem no novo
  (ficam as correções feitas aqui, como as categorias dos 9 produtos).
- **Não apaga nada.**

## Como rodar
1. **Lovable** > Cloud > SQL editor: cole `1-gerar-no-lovable.sql` e rode. Copie o texto da célula `sql`.
2. **Supabase do banco novo** (projeto `msbbdwmygabidjngsanv`) > SQL Editor: cole o texto copiado e rode.
3. Confira os totais nos dois lados (produtos, unidades, custo e valor de venda do estoque).

## Na virada
Pare de vender no Lovable, rode os passos 1 e 2 e confira os totais. Depois é só usar o novo.

## Cuidado
- O estoque do novo é sobrescrito pelo do Lovable. Não rode depois da virada, senão apaga as vendas feitas só no novo.
- Antes de rodar, exporte os produtos atuais do novo como backup.
- Pedidos, clientes e caixa não são copiados por este script.
