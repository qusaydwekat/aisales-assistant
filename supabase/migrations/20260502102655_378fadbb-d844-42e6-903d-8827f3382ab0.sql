CREATE OR REPLACE FUNCTION public.reduce_stock_on_confirm()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  item jsonb;
  product_name text;
  pid_text text;
  pid uuid;
  qty int;
BEGIN
  IF NEW.status = 'confirmed' AND (OLD.status IS NULL OR OLD.status != 'confirmed') THEN
    FOR item IN SELECT * FROM jsonb_array_elements(NEW.items)
    LOOP
      product_name := item->>'product_name';
      qty := COALESCE((item->>'quantity')::int, 1);
      pid_text := item->>'product_id';
      pid := NULL;

      -- Safely try to parse product_id as uuid
      IF pid_text IS NOT NULL AND pid_text ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
        BEGIN
          pid := pid_text::uuid;
        EXCEPTION WHEN OTHERS THEN
          pid := NULL;
        END;
      END IF;

      IF pid IS NOT NULL THEN
        UPDATE products
        SET stock = GREATEST(stock - qty, 0)
        WHERE id = pid AND store_id = NEW.store_id;
      ELSIF product_name IS NOT NULL AND product_name <> '' THEN
        UPDATE products
        SET stock = GREATEST(stock - qty, 0)
        WHERE LOWER(name) = LOWER(product_name) AND store_id = NEW.store_id;
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$function$;