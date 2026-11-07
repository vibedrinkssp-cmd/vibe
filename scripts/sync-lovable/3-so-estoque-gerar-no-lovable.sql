-- SÓ ESTOQUE — rodar no LOVABLE (Cloud > SQL editor). Só lê, não altera nada.
-- Gera, numa única célula "sql", o comando que atualiza APENAS o estoque no banco novo.
-- Não mexe em preço, custo, nome, categoria nem ativo/inativo, e não cria produtos.
-- Copie o texto da célula e rode no Supabase do banco novo (msbbdwmygabidjngsanv).
select
  'with src(id, stock) as (values '
  || string_agg(format('(%L::uuid, %s)', p.id, coalesce(p.stock, 0)), ', ')
  || ')
update products t
   set stock = s.stock
  from src s
 where t.id = s.id
   and t.stock is distinct from s.stock;' as sql
from products p;
