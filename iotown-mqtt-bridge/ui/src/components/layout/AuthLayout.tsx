import type { ReactNode } from "react";
import { useI18n } from "@/i18n";

// Same structure as the IOTOWN login page: branding panel on the left, form on the right
function GridBackground() {
  return (
    <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
      <g stroke="rgba(255,255,255,0.08)" strokeWidth="0.1">
        {Array.from({ length: 26 }, (_, i) => (
          <line key={`h${i}`} x1="0" y1={i * 4} x2="100" y2={i * 4} />
        ))}
        {Array.from({ length: 26 }, (_, i) => (
          <line key={`v${i}`} x1={i * 4} y1="0" x2={i * 4} y2="100" />
        ))}
      </g>
      <g fill="rgba(255,255,255,0.15)">
        {Array.from({ length: 24 }, (_, i) =>
          Array.from({ length: 24 }, (_, j) => (
            <circle key={`n${i}-${j}`} cx={(i + 1) * 4} cy={(j + 1) * 4} r={0.15 + ((i + j) % 3) * 0.08} />
          )),
        )}
      </g>
    </svg>
  );
}

// "IOTOWN Bridge" on one line, so the page does not read as IOTOWN itself
function Wordmark({ className, accent }: { className: string; accent: string }) {
  return (
    <h1 className={`font-black tracking-tight leading-none whitespace-nowrap ${className}`}>
      <span>IOTOWN</span> <span className={`font-semibold ${accent}`}>Bridge</span>
    </h1>
  );
}

export function AuthLayout({ children, version }: { children: ReactNode; version?: string }) {
  const { t } = useI18n();

  return (
    <div className="min-h-dvh flex">
      <div className="hidden lg:flex lg:w-1/2 xl:w-3/5 bg-linear-to-br from-violet-950 via-violet-900 to-purple-900 relative overflow-hidden">
        <GridBackground />
        <div className="absolute -top-20 -left-20 w-80 h-80 bg-violet-500/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-20 -right-20 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/4 w-40 h-40 bg-fuchsia-500/10 rounded-full blur-2xl" />

        <div className="relative z-10 flex flex-col justify-center items-center w-full p-12 text-white">
          <div className="text-center">
            <Wordmark className="text-4xl xl:text-5xl drop-shadow-2xl" accent="text-violet-300" />
            <p className="mt-4 text-sm tracking-[0.2em] uppercase text-white/60">{t.auth.tagline}</p>
          </div>
        </div>
      </div>

      <div className="w-full lg:w-1/2 xl:w-2/5 flex flex-col min-h-dvh bg-background">
        <div className="flex-1 flex items-center justify-center p-6 sm:p-12">
          <div className="w-full max-w-md">
            <div className="lg:hidden flex flex-col items-center mb-10">
              <Wordmark className="text-3xl text-primary" accent="text-foreground" />
              <p className="mt-3 text-xs tracking-[0.2em] uppercase text-muted-foreground">{t.auth.tagline}</p>
            </div>
            {children}
          </div>
        </div>
        <div className="py-4 text-center text-xs text-muted-foreground">
          {version && <span className="mr-2">v{version}</span>}© {new Date().getFullYear()}{" "}
          <a href="https://www.coxlab.kr" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">
            CoXlab Inc.
          </a>
        </div>
      </div>
    </div>
  );
}
