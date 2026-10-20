import { ChangePasswordForm } from "@/components/ChangePasswordDialog";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { useI18n } from "@/i18n";

// Shown instead of the app while the factory default password is still in use
export default function ChangePasswordPage({ version }: { version: string }) {
  const { t } = useI18n();
  return (
    <AuthLayout version={version}>
      <div className="mb-6">
        <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold text-primary mb-1">{t.auth.forcedTitle}</h2>
        <p className="text-sm text-muted-foreground">{t.auth.forcedDesc}</p>
      </div>
      <ChangePasswordForm />
    </AuthLayout>
  );
}
