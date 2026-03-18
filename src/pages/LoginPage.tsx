import { useState } from "react";
import { Zap, AlertCircle } from "lucide-react";

export default function LoginPage() {
  const [showPending, setShowPending] = useState(false);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 justify-center mb-8">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary"><Zap className="h-5 w-5 text-primary-foreground" /></div>
          <span className="font-heading text-2xl font-bold text-foreground">AISales</span>
        </div>

        <div className="glass rounded-2xl p-6 space-y-4">
          <h2 className="text-lg font-heading font-bold text-foreground text-center">Welcome back</h2>

          {showPending && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-warning/10 border border-warning/20">
              <AlertCircle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
              <p className="text-sm text-warning">Your account is pending admin approval. We'll notify you once it's activated.</p>
            </div>
          )}

          <div className="space-y-3">
            <input placeholder="Email" type="email" className="w-full rounded-lg bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary" />
            <input placeholder="Password" type="password" className="w-full rounded-lg bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary" />
          </div>

          <button
            onClick={() => setShowPending(!showPending)}
            className="w-full rounded-lg bg-primary text-primary-foreground py-2.5 font-medium text-sm hover:bg-primary/90 transition-colors"
          >
            Sign In
          </button>

          <p className="text-center text-xs text-muted-foreground">
            <a href="#" className="text-primary hover:underline">Forgot password?</a>
          </p>
        </div>

        <p className="text-center text-sm text-muted-foreground mt-4">Don't have an account? <a href="/signup" className="text-primary hover:underline">Sign up</a></p>
      </div>
    </div>
  );
}
