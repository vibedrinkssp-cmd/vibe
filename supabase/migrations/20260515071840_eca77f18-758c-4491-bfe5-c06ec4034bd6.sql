ALTER TABLE public.ifood_test_config
  ADD COLUMN IF NOT EXISTS webhook_secret text,
  ADD COLUMN IF NOT EXISTS webhook_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_webhook_at timestamptz;

UPDATE public.ifood_test_config
SET merchant_id = '4082876d-2b90-48ca-94d1-b4338881e61d',
    cached_token = NULL,
    cached_token_expires_at = NULL,
    last_error = NULL,
    last_error_at = NULL,
    updated_at = now();