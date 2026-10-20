import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Lock, LockOpen, SquareTerminal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { LogConsole, type ScrollLock, type StreamStatus } from "@/components/LogConsole";
import { Button } from "@/components/ui/button";
import { IconCardHeader } from "@/components/common";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useBridgeConfig } from "@/hooks/queries";
import { useI18n } from "@/i18n";
import { api, type BridgeConfig, type LogLevel } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";

const VIEW_LINES = 1000;
// While the scroll is locked old lines are kept (up to this many), so the lines being read do not move
const LOCKED_MAX_LINES = 10000;
const LOG_LEVELS: LogLevel[] = ["error", "warn", "info", "debug"];

// What the bridge writes at all (container log and this page); saved as soon as it is picked
function LogLevelSetting() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const config = useBridgeConfig();
  const save = useMutation({
    mutationFn: (logLevel: LogLevel) => api<BridgeConfig>("/api/config/log-level", { method: "PUT", body: { logLevel } }),
    onSuccess: (data) => {
      queryClient.setQueryData(["config"], data);
      toast.success(t.logs.logLevelSaved(data.logLevel));
    },
    onError: (err) => toast.error(errorMessage(err, t)),
  });

  return (
    <div className="space-y-2">
      <Label htmlFor="logLevel">{t.logs.logLevel}</Label>
      <Select value={config.data?.logLevel} disabled={!config.data || save.isPending} onValueChange={(v) => save.mutate(v as LogLevel)}>
        <SelectTrigger id="logLevel" className="w-56">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {LOG_LEVELS.map((l) => (
            <SelectItem key={l} value={l}>
              {l}
              <span className="ml-2 text-muted-foreground">{t.logs.logLevelDesc[l]}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-sm text-muted-foreground">{t.logs.logLevelHint}</p>
    </div>
  );
}

// Follows the bridge log over Server-Sent Events, keeping the latest VIEW_LINES lines
function useLogStream(locked: boolean) {
  const queryClient = useQueryClient();
  const [lines, setLines] = useState<string[]>([]);
  const [status, setStatus] = useState<StreamStatus>("connecting");
  const lockedRef = useRef(locked);

  useEffect(() => {
    lockedRef.current = locked;
  }, [locked]);

  useEffect(() => {
    const es = new EventSource(`/api/logs/stream?lines=${VIEW_LINES}`);
    // Sent at the start of every connection, including automatic reconnects
    es.addEventListener("reset", () => {
      setLines([]);
      setStatus("live");
    });
    es.onmessage = (e: MessageEvent<string>) => {
      const batch = JSON.parse(e.data) as string[];
      const max = lockedRef.current ? LOCKED_MAX_LINES : VIEW_LINES;
      setLines((prev) => {
        const next = prev.concat(batch);
        return next.length > max ? next.slice(next.length - max) : next;
      });
    };
    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED) {
        setStatus("closed");
        // A refused reconnect usually means the session ended; this shows the login page if so
        void queryClient.invalidateQueries({ queryKey: ["me"] });
      } else {
        setStatus("connecting");
      }
    };
    return () => es.close();
  }, [queryClient]);

  // Back to the latest lines once the scroll is unlocked
  const trim = () => setLines((prev) => (prev.length > VIEW_LINES ? prev.slice(prev.length - VIEW_LINES) : prev));

  return { lines, status, trim };
}

export default function LogsPage() {
  const { t } = useI18n();
  const [lock, setLock] = useState<ScrollLock>("off");
  const locked = lock !== "off";
  const stream = useLogStream(locked);

  const changeLock = (next: ScrollLock) => {
    setLock(next);
    if (next === "off") stream.trim();
  };

  return (
    <Card>
      <IconCardHeader
        icon={<SquareTerminal className="h-5 w-5" />}
        title={t.logs.title}
        description={t.logs.titleDesc}
        action={
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-pressed={locked}
            title={locked ? t.logs.unlockScroll : t.logs.lockScroll}
            className={cn("shrink-0", locked && "border-primary/40 bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary")}
            onClick={() => changeLock(locked ? "off" : "manual")}
          >
            {locked ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}
            <span className="sr-only">{locked ? t.logs.unlockScroll : t.logs.lockScroll}</span>
          </Button>
        }
      />
      <CardContent className="space-y-4">
        <LogConsole lines={stream.lines} status={stream.status} lock={lock} onLockChange={changeLock} />
        {/* The logging level changes what the bridge records, not what this view shows, so it is kept apart */}
        <details className="group">
          <summary className="flex cursor-pointer select-none list-none items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
            <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" />
            {t.common.advanced}
          </summary>
          <div className="mt-4 pl-6">
            <LogLevelSetting />
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
