UPDATE settings SET 
  store_address = 'Rua Siqueira Campos, 502 - Centro, São José dos Campos - SP',
  store_lat = -23.1791,
  store_lng = -45.8872,
  max_delivery_distance = 22
WHERE id = (SELECT id FROM settings LIMIT 1);