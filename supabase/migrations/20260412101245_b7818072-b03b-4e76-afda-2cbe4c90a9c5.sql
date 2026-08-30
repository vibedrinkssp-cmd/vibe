
-- Table for OCR payment confirmation audit logs
CREATE TABLE public.payment_confirmations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  motoboy_id uuid NOT NULL,
  detected_value numeric,
  ocr_status text NOT NULL DEFAULT 'pending',
  confidence_score integer DEFAULT 0,
  ocr_text text,
  image_url text,
  confirmed_manually boolean DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.payment_confirmations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff pode ver confirmações" ON public.payment_confirmations
  FOR SELECT USING (
    has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'motoboy'::app_role)
  );

CREATE POLICY "Staff pode inserir confirmações" ON public.payment_confirmations
  FOR INSERT WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'motoboy'::app_role)
  );

-- Storage bucket for payment proof images
INSERT INTO storage.buckets (id, name, public) VALUES ('payment-proofs', 'payment-proofs', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read payment proofs" ON storage.objects
  FOR SELECT USING (bucket_id = 'payment-proofs');

CREATE POLICY "Staff upload payment proofs" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'payment-proofs' AND (
      has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'motoboy'::app_role)
    )
  );

-- RPC to confirm payment from motoboy
CREATE OR REPLACE FUNCTION public.confirm_motoboy_payment(
  p_order_id uuid,
  p_motoboy_id uuid,
  p_detected_value numeric DEFAULT NULL,
  p_ocr_status text DEFAULT 'manual',
  p_confidence_score integer DEFAULT 0,
  p_ocr_text text DEFAULT NULL,
  p_image_url text DEFAULT NULL,
  p_confirmed_manually boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_confirmation_id uuid;
BEGIN
  -- Verify the order belongs to this motoboy
  IF NOT EXISTS (
    SELECT 1 FROM orders WHERE id = p_order_id AND motoboy_id = p_motoboy_id
  ) THEN
    RAISE EXCEPTION 'Order not assigned to this motoboy';
  END IF;

  -- Insert confirmation log
  INSERT INTO payment_confirmations (
    order_id, motoboy_id, detected_value, ocr_status, 
    confidence_score, ocr_text, image_url, confirmed_manually
  ) VALUES (
    p_order_id, p_motoboy_id, p_detected_value, p_ocr_status,
    p_confidence_score, p_ocr_text, p_image_url, p_confirmed_manually
  ) RETURNING id INTO v_confirmation_id;

  -- Mark order payment as confirmed
  UPDATE orders SET 
    payment_confirmed = true,
    payment_confirmed_at = now(),
    payment_confirmed_by = 'motoboy:' || p_motoboy_id::text
  WHERE id = p_order_id;

  RETURN v_confirmation_id;
END;
$$;
