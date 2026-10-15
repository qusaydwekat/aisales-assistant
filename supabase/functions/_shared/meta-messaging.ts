// Meta 24-hour window compliance for Messenger/Instagram sends.
// Inside the window a plain RESPONSE is allowed; outside it, Meta requires an
// approved message tag or it returns error 10/551 and may restrict the page.
export type MetaTag = "POST_PURCHASE_UPDATE" | "CONFIRMED_EVENT_UPDATE" | "ACCOUNT_UPDATE" | "HUMAN_AGENT";

const WINDOW_MS = 24 * 60 * 60 * 1000;

export function metaMessagingFields(
  platform: string,
  lastCustomerMessageAt: string | null | undefined,
  tag: MetaTag | null,
): Record<string, string> {
  const inWindow = lastCustomerMessageAt
    ? Date.now() - new Date(lastCustomerMessageAt).getTime() < WINDOW_MS
    : false;
  if (inWindow || !tag) return { messaging_type: "RESPONSE" };
  // Instagram only accepts HUMAN_AGENT outside the window.
  const effective = platform === "instagram" ? "HUMAN_AGENT" : tag;
  return { messaging_type: "MESSAGE_TAG", tag: effective };
}

export async function lastCustomerMessageAt(supabase: any, conversationId: string): Promise<string | null> {
  const { data } = await supabase
    .from("messages")
    .select("created_at")
    .eq("conversation_id", conversationId)
    .eq("sender", "customer")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.created_at ?? null;
}
