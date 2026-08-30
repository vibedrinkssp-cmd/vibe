
UPDATE users 
SET password = 'sha256:' || gen_random_uuid()::text || ':' || encode(
  extensions.digest(
    (gen_random_uuid()::text || 'totem93')::bytea, 'sha256'
  ), 'hex'
)
WHERE id = 'd7659d91-b07c-465e-a50b-6aa6b7058280' AND password = 'totem93';
