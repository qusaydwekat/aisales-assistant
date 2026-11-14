import {
  buildMessageDecisionRequest,
  parseMessageDecision,
  type MessageDecision,
  type MessageDecisionInput,
} from "./jev-policy.ts";

const JEV_ENDPOINT = "https://ai.gateway.lovable.dev/v1/systemone";

export async function decideCustomerMessage(
  input: MessageDecisionInput,
): Promise<MessageDecision | null> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey || !input.currentMessage.trim()) return null;

  const requestBody = JSON.stringify(buildMessageDecisionRequest(input));
  const send = () => fetch(JEV_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: requestBody,
    signal: AbortSignal.timeout(6000),
  });

  try {
    let response = await send();
    if (response.status === 429 || response.status >= 500) {
      await response.text().catch(() => "");
      await new Promise((resolve) => setTimeout(resolve, 400 + Math.random() * 600));
      response = await send();
    }

    if (!response.ok) {
      const safeError = await response.text().catch(() => "");
      console.warn(`Jev decision unavailable (${response.status}): ${safeError.slice(0, 300)}`);
      return null;
    }

    const decision = parseMessageDecision(await response.json());
    console.log(`Jev message decision: ${JSON.stringify(decision)}`);
    return decision;
  } catch (error) {
    console.warn("Jev decision failed; continuing with the main agent:", error);
    return null;
  }
}
