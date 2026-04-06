-- Add AI instructions column to ai_settings
ALTER TABLE public.ai_settings 
ADD COLUMN IF NOT EXISTS ai_instructions text DEFAULT 'You are a helpful sales assistant. Help customers find products, answer questions about the store, and assist with placing orders. Be polite, concise, and always try to help the customer find what they need.';

-- Create trigger function to reduce stock when order is confirmed
CREATE OR REPLACE FUNCTION public.reduce_stock_on_confirm()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  item jsonb;
  product_name text;
  product_id uuid;
  qty int;
BEGIN
  -- Only trigger when status changes to 'confirmed'
  IF NEW.status = 'confirmed' AND (OLD.status IS NULL OR OLD.status != 'confirmed') THEN
    -- Loop through order items
    FOR item IN SELECT * FROM jsonb_array_elements(NEW.items)
    LOOP
      product_name := item->>'product_name';
      qty := COALESCE((item->>'quantity')::int, 1);
      
      -- Try to match by product_id first, then by name
      IF item->>'product_id' IS NOT NULL THEN
        UPDATE products 
        SET stock = GREATEST(stock - qty, 0)
        WHERE id = (item->>'product_id')::uuid AND store_id = NEW.store_id;
      ELSE
        -- Match by product name (case-insensitive)
        UPDATE products 
        SET stock = GREATEST(stock - qty, 0)
        WHERE LOWER(name) = LOWER(product_name) AND store_id = NEW.store_id;
      END IF;
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Create trigger on orders table
DROP TRIGGER IF EXISTS trigger_reduce_stock_on_confirm ON orders;
CREATE TRIGGER trigger_reduce_stock_on_confirm
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION reduce_stock_on_confirm();