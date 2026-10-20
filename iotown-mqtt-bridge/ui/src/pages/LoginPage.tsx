import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/i18n";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/errors";

export default function LoginPage({ version }: { version: string }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const login = useMutation({
    mutationFn: () => api("/api/auth/login", { method: "POST", body: { username, password } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["me"] }),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    login.mutate();
  };

  return (
    <AuthLayout version={version}>
      <div className="mb-6">
        <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold text-primary mb-1">{t.auth.login}</h2>
        <p className="text-sm text-muted-foreground">{t.auth.loginDesc}</p>
      </div>
      <form onSubmit={submit} className="space-y-5">
        {login.isError && (
          <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-lg border border-destructive/20">
            {errorMessage(login.error, t)}
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="username">{t.auth.username}</Label>
          <Input id="username" className="h-12" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">{t.auth.password}</Label>
          <Input
            id="password"
            type="password"
            className="h-12"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            autoFocus
          />
        </div>
        <Button type="submit" className="w-full h-12 text-base font-semibold" disabled={login.isPending || !password}>
          {t.auth.login}
        </Button>
      </form>
    </AuthLayout>
  );
}
