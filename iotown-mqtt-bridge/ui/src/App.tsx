import { useQuery } from "@tanstack/react-query";
import { Navigate, Route, Routes } from "react-router";
import { AppLayout } from "./components/layout/AppLayout";
import { useI18n } from "./i18n";
import { api, type Me } from "./lib/api";
import ChangePasswordPage from "./pages/ChangePasswordPage";
import ConnectionPage from "./pages/ConnectionPage";
import LoginPage from "./pages/LoginPage";
import LogsPage from "./pages/LogsPage";
import MappingPage from "./pages/MappingPage";
import StatusPage from "./pages/StatusPage";

function Loading() {
  const { t } = useI18n();
  return (
    <div className="min-h-dvh flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
        <p className="text-sm text-muted-foreground">{t.common.loading}</p>
      </div>
    </div>
  );
}

export default function App() {
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<Me>("/api/auth/me") });
  if (me.isPending) return <Loading />;
  if (!me.data?.authenticated) return <LoginPage version={me.data?.version ?? ""} />;
  if (me.data.mustChangePassword) return <ChangePasswordPage version={me.data.version} />;
  return (
    <AppLayout version={me.data.version}>
      <Routes>
        <Route path="/" element={<StatusPage />} />
        <Route path="/mapping" element={<MappingPage />} />
        <Route path="/connection" element={<ConnectionPage />} />
        <Route path="/logs" element={<LogsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppLayout>
  );
}
