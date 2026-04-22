import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { message, personaName, tone, language } = await req.json();

    // Load admin AI provider config
    let provider = "openai";
    let model = "gpt-4o-mini";
    try {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      const { data: cfg } = await supabase
        .from("platform_ai_config")
        .select("provider, test_model")
        .limit(1)
        .maybeSingle();
      if (cfg?.provider) provider = cfg.provider;
      if (cfg?.test_model) model = cfg.test_model;
    } catch (e) {
      console.warn("platform_ai_config fetch failed:", e);
    }

    const isLovable = provider === "lovable";
    const apiKey = isLovable ? Deno.env.get("LOVABLE_API_KEY") : Deno.env.get("OPENAI_API_KEY");
    const endpoint = isLovable
      ? "https://ai.gateway.lovable.dev/v1/chat/completions"
      : "https://api.openai.com/v1/chat/completions";

    if (!apiKey) {
      throw new Error(`${isLovable ? "LOVABLE_API_KEY" : "OPENAI_API_KEY"} is not configured`);
    }

    const toneDesc = tone === 'professional' ? 'professional and formal' : tone === 'casual' ? 'casual and fun' : 'friendly and warm';
    const langDesc = language === 'ar' ? 'Respond in Arabic.' : language === 'en' ? 'Respond in English.' : 'Respond in the same language as the customer.';

    const systemPrompt = `You are ${personaName || 'Sara'}, an AI sales assistant for an online store. Your tone is ${toneDesc}. ${langDesc}
You help customers with product inquiries, order placement, and general questions. Keep responses concise (2-3 sentences max). Be helpful and aim to convert inquiries into sales.`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI provider error:", provider, response.status, errText);
      let parsedErr: any = {};
      try { parsedErr = JSON.parse(errText); } catch { /* ignore */ }
      const code = parsedErr?.error?.code || parsedErr?.error?.type || "";
      const detailMsg = parsedErr?.error?.message || errText || `AI error ${response.status}`;

      if (response.status === 402 || code === "insufficient_quota" || /quota/i.test(detailMsg)) {
        return new Response(JSON.stringify({ error: isLovable ? "Lovable AI credits exhausted. Add credits in Workspace Settings → Usage." : "OpenAI quota exceeded. Add billing/credits to your OpenAI account.", detail: detailMsg }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (code === "invalid_api_key" || response.status === 401) {
        return new Response(JSON.stringify({ error: `Invalid ${isLovable ? "Lovable" : "OpenAI"} API key.`, detail: detailMsg }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "AI rate limited. Try again shortly.", detail: detailMsg }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: `AI error ${response.status}`, detail: detailMsg }), {
        status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || "I'm here to help! Could you tell me more?";

    return new Response(JSON.stringify({ reply, provider, model }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-chat-test error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
