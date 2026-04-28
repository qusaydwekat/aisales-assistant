UPDATE public.platform_ai_config
SET model = 'gpt-5-mini',
    test_model = 'gpt-5-mini',
    autofill_model = 'gpt-5-mini',
    updated_at = now()
WHERE model = 'gpt-5.5' OR test_model = 'gpt-5.5' OR autofill_model = 'gpt-5.5';