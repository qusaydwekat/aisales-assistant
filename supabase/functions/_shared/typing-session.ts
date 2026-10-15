// Meta typing actions expire, so renew them throughout a reply's lifetime.
// Serialize actions so a late typing_on cannot arrive after typing_off.
export function startTypingSession(
  send: (action: "typing_on" | "typing_off") => Promise<unknown>,
) {
  let stopped = false;
  let pending: Promise<void> | undefined;

  const refresh = () => {
    if (stopped || pending) return;
    pending = Promise.resolve()
      .then(() => send("typing_on"))
      .then(() => {}, () => {})
      .finally(() => { pending = undefined; });
  };

  refresh();
  const timer = setInterval(refresh, 4000);

  return {
    refresh,
    async stop(clearIndicator = true) {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
      await pending;
      if (clearIndicator) {
        await Promise.resolve().then(() => send("typing_off")).catch(() => {});
      }
    },
  };
}