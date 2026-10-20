import type { ReactNode } from "react";
import { CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/i18n";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";

export function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b last:border-b-0">
      <span className="text-sm text-muted-foreground shrink-0">{label}</span>
      <span className="text-sm font-medium text-right break-all">{children}</span>
    </div>
  );
}

// Top of a card on every page: an icon in a tinted circle, the title, one short line on what the card is
// for, and an optional control on the right
export function IconCardHeader({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <CardHeader className="flex flex-row items-start gap-3 space-y-0">
      <div className="h-10 w-10 shrink-0 rounded-full bg-primary/10 text-primary flex items-center justify-center">{icon}</div>
      <div className="flex-1 min-w-0 space-y-1">
        <CardTitle className="text-lg">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </div>
      {action}
    </CardHeader>
  );
}

// A labelled control with an optional description, used for switches in settings cards
export function SettingRow({
  label,
  description,
  className,
  children,
}: {
  label: string;
  description?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-4 py-2", className)}>
      <div className="space-y-0.5">
        <p className="text-sm font-medium">{label}</p>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </div>
  );
}

export function FieldError({ message }: { message?: string }) {
  return message ? <p className="text-sm text-destructive">{message}</p> : null;
}

export function LoadError({ error }: { error: unknown }) {
  const { t } = useI18n();
  return <p className="text-sm text-destructive">{errorMessage(error, t)}</p>;
}

export function PageLoading() {
  const { t } = useI18n();
  return <p className="text-sm text-muted-foreground py-8 text-center">{t.common.loading}</p>;
}
