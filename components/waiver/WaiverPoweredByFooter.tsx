import { WAIVERTRAIL_URL } from "@/lib/waiver/waivertrail-branding";
import { cn } from "@/lib/utils";

export function WaiverPoweredByFooter({ className }: { className?: string }) {
  return (
    <p className={cn("text-center text-xs text-brand-muted mt-6 pt-4 border-t border-brand-dark/10", className)}>
      Powered by{" "}
      <a
        href={WAIVERTRAIL_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-brand-primary underline underline-offset-2 hover:text-brand-primary/80"
      >
        WaiverTrail
      </a>
    </p>
  );
}
