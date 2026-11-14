export const MESSAGE_INTENTS = [
  "greeting",
  "product_inquiry",
  "order_create",
  "order_update",
  "order_cancel",
  "order_status",
  "store_info",
  "complaint",
  "human_handoff",
  "other",
] as const;

export type MessageIntent = typeof MESSAGE_INTENTS[number];

export interface MessageDecision {
  intent: MessageIntent;
  intentConfidence: number;
  cancellationProbability: number;
}

export interface MessageDecisionInput {
  currentMessage: string;
  recentConversation?: Array<{ sender: string; content: string }>;
  activeOrders?: Array<{ order_number: string; status: string }>;
}

export function buildMessageDecisionRequest(input: MessageDecisionInput) {
  return {
    model: "typesafe/jev-1.13",
    state: {
      current_message: input.currentMessage,
      recent_conversation: (input.recentConversation || []).slice(-8).map((message) => ({
        sender: message.sender,
        text: message.content,
      })),
      active_orders: input.activeOrders || [],
    },
    questions: {
      primary_intent: {
        type: "choice",
        instructions: {
          question: "What is the customer's primary goal in `current_message`?",
          guidance: [
            "Use `recent_conversation` only to resolve references such as 'it', 'that order', or a newly supplied address.",
            "For several goals, choose the action that most needs handling now. Do not infer an order action from a greeting or from a customer merely announcing that they want to ask something.",
            "Judge meaning in Arabic, English, dialects, and mixed-language messages; do not rely on exact keywords.",
          ],
        },
        criteria: {
          greeting: "Only a greeting, thanks, pleasantry, or a vague opener with no concrete request yet.",
          product_inquiry: "Browsing, product details, price, availability, photos, recommendations, or product comparisons.",
          order_create: "Wants to buy or place a new order, or is supplying details requested to complete a new order.",
          order_update: "Wants to change an existing order, including address, phone, name, items, variants, or quantity. Removing one item is an update, not cancellation of the whole order.",
          order_cancel: "Wants to withdraw or cancel an entire existing order, or clearly says they no longer want it.",
          order_status: "Asks where an existing order is, its status, delivery progress, or tracking.",
          store_info: "Asks about delivery terms, payment methods, opening hours, returns, location, or another store policy.",
          complaint: "Reports a service, product, delivery, or order problem without primarily requesting one of the order actions above.",
          human_handoff: "Explicitly asks to speak with a person, employee, manager, or human support.",
          other: "No listed intent fits, or the message is too unclear to classify responsibly.",
        },
      },
      cancellation_requested: {
        type: "noul",
        instructions: "Does `current_message` explicitly request cancellation of an entire existing order or clearly state that the customer no longer wants that order?",
        criteria: {
          true: "A present request to cancel, withdraw, or abandon the whole order, including changed-my-mind statements and equivalent Arabic dialect phrasing.",
          false: "No whole-order cancellation is requested. Questions about cancellation policy, requests not to cancel, removing only an item, changing quantity or address, disappointment, and a new customer saying they do not want a product before ordering are all false.",
        },
      },
    },
  };
}

export function parseMessageDecision(payload: any): MessageDecision {
  const intentAnswer = payload?.answers?.primary_intent;
  const cancellationAnswer = payload?.answers?.cancellation_requested;
  const intent = intentAnswer?.choice;
  const intentConfidence = intentAnswer?.confidence;
  const cancellationProbability = cancellationAnswer?.noul;

  if (!MESSAGE_INTENTS.includes(intent)) {
    throw new Error("Jev returned no valid primary intent");
  }
  if (!Number.isFinite(intentConfidence) || intentConfidence < 0 || intentConfidence > 1) {
    throw new Error("Jev returned no valid intent confidence");
  }
  if (!Number.isFinite(cancellationProbability) || cancellationProbability < 0 || cancellationProbability > 1) {
    throw new Error("Jev returned no valid cancellation probability");
  }

  return { intent, intentConfidence, cancellationProbability };
}

export function shouldCancelDirectly(decision: MessageDecision | null): boolean {
  return !!decision && decision.cancellationProbability >= 0.85;
}

export function shouldEmphasizeCancellation(decision: MessageDecision | null): boolean {
  return !!decision && (
    decision.cancellationProbability >= 0.55 ||
    (decision.intent === "order_cancel" && decision.intentConfidence >= 0.6)
  );
}

export function hasCancelKeyword(text: string): boolean {
  return /(الغي|إلغاء|الغاء|كنسل|بطل|بطلت|ما بدي الطلب|ما عاد بدي|ما بقا بدي|تراجعت|cancel|abort|nevermind|changed my mind|don'?t want it|no longer want)/i.test(text || "");
}

export function shouldRedirectUpdateToCancel(
  customerText: string,
  decision: MessageDecision | null,
): boolean {
  if (decision) {
    if (decision.cancellationProbability <= 0.3) return false;
    if (shouldEmphasizeCancellation(decision)) return true;
  }
  return hasCancelKeyword(customerText);
}
