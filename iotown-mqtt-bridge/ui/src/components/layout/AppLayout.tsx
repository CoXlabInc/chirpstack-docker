import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Activity, ArrowRightLeft, Cable, Check, ChevronDown, Globe, KeyRound, LogOut, Menu, Moon, ScrollText, Sun, User } from "lucide-react";
import { useTheme } from "next-themes";
import { useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router";
import { ChangePasswordDialog } from "@/components/ChangePasswordDialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useI18n, type Locale } from "@/i18n";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

interface NavItem {
  to: string;
  icon: typeof Activity;
  label: string;
}

function useNavItems(): NavItem[] {
  const { t } = useI18n();
  return [
    { to: "/", icon: Activity, label: t.nav.status },
    { to: "/mapping", icon: ArrowRightLeft, label: t.nav.mapping },
    { to: "/connection", icon: Cable, label: t.nav.connection },
    { to: "/logs", icon: ScrollText, label: t.nav.logs },
  ];
}

// Same look as the IOTOWN sidebar (violet gradient, white text, active bar)
function SidebarContent({ items, version, onNavigate }: { items: NavItem[]; version: string; onNavigate?: () => void }) {
  return (
    <div className="flex flex-col h-full bg-linear-to-b from-violet-600 via-violet-700 to-violet-800 dark:from-violet-800 dark:via-violet-900 dark:to-violet-950">
      <div className="h-14 px-4 flex items-center border-b border-white/10">
        <span className="text-xl font-bold tracking-tight drop-shadow-sm">
          <span className="text-white">IO</span>
          <span className="text-white/70">TOWN</span>
          <span className="ml-2 text-sm font-medium text-white/60">Bridge</span>
        </span>
      </div>
      <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
                isActive ? "bg-white/20 text-white shadow-sm" : "text-white/75 hover:bg-white/10 hover:text-white",
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-white rounded-r-full shadow-sm shadow-white/50" />
                )}
                <item.icon className="h-5 w-5" />
                <span>{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="px-4 py-3 border-t border-white/10 text-[11px] text-white/40">v{version}</div>
    </div>
  );
}

function Header({ title, icon: Icon, onMenu }: { title: string; icon?: NavItem["icon"]; onMenu: () => void }) {
  const { t, locale, setLocale } = useI18n();
  const { resolvedTheme, setTheme } = useTheme();
  const queryClient = useQueryClient();
  const [passwordOpen, setPasswordOpen] = useState(false);
  const logout = useMutation({
    mutationFn: () => api("/api/auth/logout", { method: "POST" }),
    onSettled: () => queryClient.setQueryData(["me"], { authenticated: false, version: "" }),
  });
  const locales: { code: Locale; label: string }[] = [
    { code: "ko", label: "한국어" },
    { code: "en", label: "English" },
  ];

  return (
    <header className="h-14 border-b bg-background/95 backdrop-blur px-4 lg:px-6 flex items-center justify-between sticky top-0 z-40">
      <div className="flex items-center gap-3 min-w-0">
        <Button variant="ghost" size="icon" className="lg:hidden shrink-0" onClick={onMenu}>
          <Menu className="h-5 w-5" />
          <span className="sr-only">{t.common.menu}</span>
        </Button>
        {/* Same title style as the IOTOWN header: the menu icon in a tinted square */}
        <h1 className="flex items-center gap-2 min-w-0 text-lg font-semibold">
          {Icon && (
            <span className="flex items-center justify-center w-7 h-7 shrink-0 rounded-lg bg-primary/10 text-primary">
              <Icon className="h-4 w-4" />
            </span>
          )}
          <span className="truncate">{title}</span>
        </h1>
      </div>
      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-9 w-9">
              <Globe className="h-4 w-4" />
              <span className="sr-only">{t.common.language}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {locales.map((l) => (
              <DropdownMenuItem key={l.code} onClick={() => setLocale(l.code)} className="cursor-pointer">
                <span className="flex-1">{l.label}</span>
                {locale === l.code && <Check className="h-4 w-4 ml-2" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
        >
          {resolvedTheme === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          <span className="sr-only">{t.common.theme}</span>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-9 gap-2 px-2 sm:px-3">
              <div className="flex items-center justify-center h-7 w-7 rounded-full bg-primary/10">
                <User className="h-4 w-4 text-primary" />
              </div>
              <span className="hidden sm:inline-block text-sm font-medium">admin</span>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setPasswordOpen(true)} className="cursor-pointer">
              <KeyRound className="h-4 w-4 mr-2" />
              {t.auth.changePassword}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => logout.mutate()} className="cursor-pointer">
              <LogOut className="h-4 w-4 mr-2" />
              {t.auth.logout}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <ChangePasswordDialog open={passwordOpen} onOpenChange={setPasswordOpen} />
    </header>
  );
}

export function AppLayout({ children, version }: { children: ReactNode; version: string }) {
  const items = useNavItems();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const current = items.find((i) => (i.to === "/" ? location.pathname === "/" : location.pathname.startsWith(i.to)));
  const { t } = useI18n();

  return (
    <div className="flex h-dvh overflow-hidden bg-muted/30">
      <aside className="hidden lg:block w-60 shrink-0">
        <SidebarContent items={items} version={version} />
      </aside>
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="p-0 w-64 border-0">
          <SheetTitle className="sr-only">{t.common.menu}</SheetTitle>
          <SidebarContent items={items} version={version} onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>
      <div className="flex-1 flex flex-col min-w-0">
        <Header title={current?.label ?? t.app.title} icon={current?.icon} onMenu={() => setMobileOpen(true)} />
        {/* relative: Radix hides native inputs with position:absolute; without a positioned
            scroll container they extend the page itself and leave blank space below the layout */}
        {/* The scrollbar's space is kept on pages that do not scroll, so cards line up the same on every page */}
        <main className="relative flex-1 p-3 lg:p-6 overflow-y-auto [scrollbar-gutter:stable]">
          <div className="mx-auto max-w-5xl space-y-4">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
