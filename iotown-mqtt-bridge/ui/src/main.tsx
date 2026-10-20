import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import App from "./App";
import { Toaster } from "./components/ui/sonner";
import { I18nProvider } from "./i18n";
import { ApiError, type Me } from "./lib/api";
import "./index.css";

// Any 401/403 from the API means the session ended or the password must be changed first
function onApiError(err: unknown) {
  if (!(err instanceof ApiError)) return;
  if (err.status === 401) {
    queryClient.setQueryData<Me>(["me"], (me) => ({ version: me?.version ?? "", authenticated: false }));
  } else if (err.code === "PASSWORD_CHANGE_REQUIRED") {
    void queryClient.invalidateQueries({ queryKey: ["me"] });
  }
}

const queryClient: QueryClient = new QueryClient({
  queryCache: new QueryCache({ onError: onApiError }),
  mutationCache: new MutationCache({ onError: onApiError }),
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider attribute="class" defaultTheme="light">
      <I18nProvider>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <App />
          </BrowserRouter>
          <Toaster richColors position="top-center" />
        </QueryClientProvider>
      </I18nProvider>
    </ThemeProvider>
  </StrictMode>,
);
