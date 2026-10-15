import logo from "@/assets/aisales-logo.png";
import { cn } from "@/lib/utils";

export function BrandLogo({ compact = false, className }: { compact?: boolean; className?: string }) {
  return <span dir="ltr" className={cn("inline-flex shrink-0 items-center gap-2", className)}>
    <img src={logo} alt={compact ? "AISales" : ""} width={46} height={34} className="h-9 w-12 shrink-0 object-contain" />
    {!compact && <span className="font-heading text-2xl font-bold text-foreground">AI<span className="text-primary">Sales</span></span>}
  </span>;
}