# Architecture rules

- Customer reply workers own a typing session from burst collection through final outbound delivery, with serialized refreshes and finally-based cleanup, so slow AI/tool calls cannot leave a gap or leak timers.- Automated Meta sends go through `_shared/meta-messaging.ts` so out-of-24h messages carry a message tag; Meta blocks untagged ones.
- The customer agent retries a failed AI round once on a model from the other provider family (circuit breaker), so one upstream outage cannot stall replies.
- platform-webhook stores each verified Meta payload in a durable queue, acks 200 at once, and processes in the background with backoff retries (no polling cron), so Meta never times out and failed payloads aren't lost.
- platform-webhook is split into modules by concern (shared, meta-client, ai-agent, ai-tools, order-manager, burst-collector, conversation-intel, queue); add new code to the matching module, not index.ts.
