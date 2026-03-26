import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Zap } from "lucide-react";

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading, profile, role, signOut } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary animate-pulse">
            <Zap className="h-6 w-6 text-primary-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  // Block pending/suspended users (except admins)
  if (profile && profile.status !== 'active' && role !== 'admin') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-sm text-center space-y-4">
          <div className="flex items-center gap-2 justify-center mb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary">
              <Zap className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="font-heading text-2xl font-bold text-foreground">AISales</span>
          </div>
          <div className="glass rounded-2xl p-6 space-y-4">
            <div className="flex h-16 w-16 mx-auto items-center justify-center rounded-full bg-warning/20">
              <Zap className="h-8 w-8 text-warning" />
            </div>
            <h2 className="text-lg font-heading font-bold text-foreground">
              {profile.status === 'pending' ? 'Account Pending Approval' : 'Account Suspended'}
            </h2>
            <p className="text-sm text-muted-foreground">
              {profile.status === 'pending'
                ? 'Your account is being reviewed by our admin team. You will be able to access your dashboard once approved.'
                : 'Your account has been suspended. Please contact support for assistance.'}
            </p>
            <button
              onClick={() => signOut()}
              className="w-full rounded-lg bg-muted text-foreground py-2.5 font-medium text-sm hover:bg-muted/80 transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
