-- PASSO 1 — rodar no LOVABLE (Cloud > SQL editor). Só lê, não altera nada.
-- Gera, numa única célula "sql", o comando que atualiza o banco novo.
-- Copie o texto da célula e rode no PASSO 2 (Supabase do banco novo).
select
  'with src(id, name, category, stock, cost_price, sale_price, is_active, barcode) as (values '
  || string_agg(
       format('(%L::uuid, %L, %L, %s, %s, %s, %L::boolean, %L)',
         p.id, p.name, coalesce(c.name, ''), p.stock, coalesce(p.cost_price, 0),
         p.sale_price, p.is_active, p.barcode),
       ', ')
  || '), upd as (
  update products t
     set stock = s.stock, cost_price = s.cost_price, sale_price = s.sale_price, is_active = s.is_active
    from src s
   where t.id = s.id
  returning t.id
)
insert into products (id, name, category_id, stock, cost_price, sale_price, is_active, barcode)
select s.id, s.name,
       (select c.id from categories c where c.name = s.category order by c.is_active desc, c.sort_order limit 1),
       s.stock, s.cost_price, s.sale_price, s.is_active, s.barcode
  from src s
 where not exists (select 1 from products t where t.id = s.id);' as sql
from products p
left join categories c on c.id = p.category_id;
