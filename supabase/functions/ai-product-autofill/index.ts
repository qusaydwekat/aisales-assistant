// Edge function: ai-product-autofill
// Vision-first auto-fill for the nameless-product (visual-first) catalog.
// Returns ALL visual attributes + a customer-facing auto_description and a
// 1536-dim embedding the matching engine can use for similarity search.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { image_url, language } = await req.json();
    if (!image_url || typeof image_url !== "string") {
      return new Response(JSON.stringify({ error: "image_url required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let provider = "openai";
    let model = "gpt-4o-mini";
    try {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      const { data: cfg } = await supabase
        .from("platform_ai_config")
        .select("provider, autofill_model")
        .limit(1)
        .maybeSingle();
      if (cfg?.provider) provider = cfg.provider;
      if (cfg?.autofill_model) model = cfg.autofill_model;
    } catch (e) {
      console.warn("platform_ai_config fetch failed:", e);
    }

    const isLovable = provider === "lovable";
    const apiKey = isLovable ? Deno.env.get("LOVABLE_API_KEY") : Deno.env.get("OPENAI_API_KEY");
    const endpoint = isLovable
      ? "https://ai.gateway.lovable.dev/v1/chat/completions"
      : "https://api.openai.com/v1/chat/completions";

    if (!apiKey) {
      return new Response(JSON.stringify({ error: `${isLovable ? "LOVABLE_API_KEY" : "OPENAI_API_KEY"} missing` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const lang = language === "ar" ? "Arabic" : language === "en" ? "English" : "the same language as typically used by the store (default English)";

    // ─── 1) Vision extraction ───────────────────────────────────────
    // Force gpt-4o (vision-capable) when the configured autofill_model is text-only.
    const visionModel = /mini|gpt-3|3\.5/i.test(model) ? "gpt-4o" : model;

    const resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: visionModel,
        messages: [
          {
            role: "system",
            content:
              `You are a fashion/product cataloging assistant. Look at the product image and extract every visual attribute you can see. ` +
              `The store sells items WITHOUT product names — your auto_description is the ONLY way the AI can refer to this item with customers. ` +
              `Write auto_description in ${lang} as ONE short, natural sentence that a sales assistant would actually say (e.g. "Flowy red floral V-neck midi dress" or "فستان أحمر متوسط الطول بأكمام قصيرة ورقبة على شكل V"). ` +
              `Never use brand names. Never invent attributes you cannot see. If a field doesn't apply (e.g. sleeve on pants), return null for it. ` +
              `Always call the suggest_visual_product tool exactly once.`,
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Analyze this product image and extract all visual attributes." },
              { type: "image_url", image_url: { url: image_url } },
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "suggest_visual_product",
              description: "Return all visual product attributes extracted from the image",
              parameters: {
                type: "object",
                properties: {
                  // Customer-facing
                  auto_description: { type: "string", description: "ONE short natural sentence describing the item visually, in the requested language" },
                  name: { type: "string", description: "Optional short internal label (max 60 chars). Can equal auto_description." },
                  description: { type: "string", description: "1-2 sentence marketing description" },
                  category: { type: "string", description: "Single category word (e.g. 'Dresses', 'Tops', 'Pants', 'Shoes', 'Accessories')" },
                  suggested_price: { type: "number", description: "Estimated retail price in USD, 0 if unknown" },

                  // Visual attributes
                  type: { type: ["string", "null"], description: "Item type: dress | top | pants | jacket | skirt | shoes | bag | accessory | ..." },
                  color: { type: "array", items: { type: "string" }, description: "Visible colors, lowercase English (e.g. ['red', 'white'])" },
                  pattern: { type: ["string", "null"], description: "solid | floral | striped | checkered | polka | graphic | abstract | ..." },
                  style: { type: ["string", "null"], description: "casual | formal | sporty | bohemian | streetwear | vintage | ..." },
                  material: { type: ["string", "null"], description: "cotton | chiffon | denim | leather | knit | polyester | ..." },
                  fit: { type: ["string", "null"], description: "slim | regular | oversized | tailored | loose | fitted" },
                  occasion: { type: "array", items: { type: "string" }, description: "['daily', 'beach', 'wedding', 'office', 'party', ...]" },
                  sleeve: { type: ["string", "null"], description: "sleeveless | short | long | 3/4 (or null if not applicable)" },
                  neckline: { type: ["string", "null"], description: "v-neck | round | collar | off-shoulder | turtleneck | ..." },
                  length: { type: ["string", "null"], description: "mini | knee | midi | maxi | crop | regular | long" },
                },
                required: ["auto_description", "name", "description", "category", "suggested_price", "color"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "suggest_visual_product" } },
      }),
    });

    if (!resp.ok) {
      const txt = await resp.text();
      console.error("Vision API error:", resp.status, txt);
      return new Response(JSON.stringify({ error: "AI gateway error", detail: txt }), {
        status: resp.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
    const args = toolCall?.function?.arguments;
    let parsed: any = {};
    try {
      parsed = typeof args === "string" ? JSON.parse(args) : args || {};
    } catch (_) {
      parsed = {};
    }

    // Normalize the suggestion shape returned to the client
    const suggestion = {
      // legacy fields (still used by ProductWizard)
      name: parsed.name || parsed.auto_description || "",
      description: parsed.description || parsed.auto_description || "",
      category: parsed.category || "",
      suggested_price: parsed.suggested_price ?? 0,
      // new visual fields
      auto_description: parsed.auto_description || parsed.name || "",
      type: parsed.type || null,
      color: Array.isArray(parsed.color) ? parsed.color : [],
      pattern: parsed.pattern || null,
      style: parsed.style || null,
      material: parsed.material || null,
      fit: parsed.fit || null,
      occasion: Array.isArray(parsed.occasion) ? parsed.occasion : [],
      sleeve: parsed.sleeve || null,
      neckline: parsed.neckline || null,
      length: parsed.length || null,
    };

    // ─── 2) Embedding for visual similarity search ─────────────────
    // We embed a structured attribute string so customer image searches
    // (which are also embedded the same way after vision extraction)
    // produce meaningful cosine similarities.
    let embedding: number[] | null = null;
    try {
      // Embeddings only via OpenAI direct (Lovable AI gateway doesn't expose this).
      const openaiKey = Deno.env.get("OPENAI_API_KEY");
      if (openaiKey) {
        const embedText = buildEmbeddingText(suggestion);
        const embResp = await fetch("https://api.openai.com/v1/embeddings", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${openaiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "text-embedding-3-small",
            input: embedText,
          }),
        });
        if (embResp.ok) {
          const embData = await embResp.json();
          embedding = embData?.data?.[0]?.embedding || null;
        } else {
          console.warn("Embedding API non-ok:", embResp.status);
        }
      }
    } catch (e) {
      console.warn("Embedding generation failed:", e);
    }

    return new Response(JSON.stringify({ suggestion, embedding }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-product-autofill error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// Build the canonical text representation we embed for similarity search.
// Customer photos are vision-extracted with the same schema and embedded with
// the same builder so cosine distance reflects visual similarity.
function buildEmbeddingText(s: any): string {
  const parts: string[] = [];
  if (s.auto_description) parts.push(s.auto_description);
  if (s.type) parts.push(`type:${s.type}`);
  if (s.color?.length) parts.push(`color:${s.color.join(",")}`);
  if (s.pattern) parts.push(`pattern:${s.pattern}`);
  if (s.style) parts.push(`style:${s.style}`);
  if (s.material) parts.push(`material:${s.material}`);
  if (s.fit) parts.push(`fit:${s.fit}`);
  if (s.sleeve) parts.push(`sleeve:${s.sleeve}`);
  if (s.neckline) parts.push(`neckline:${s.neckline}`);
  if (s.length) parts.push(`length:${s.length}`);
  if (s.occasion?.length) parts.push(`occasion:${s.occasion.join(",")}`);
  if (s.category) parts.push(`category:${s.category}`);
  return parts.join(" | ") || s.name || "product";
}
