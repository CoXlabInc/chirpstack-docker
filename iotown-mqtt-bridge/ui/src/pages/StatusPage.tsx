import { ArrowRightLeft, ChartColumn, type LucideIcon, Radio, Server, TriangleAlert } from "lucide-react";
import { IconCardHeader, InfoRow, LoadError, PageLoading } from "@/components/common";
import { Card, CardContent } from "@/components/ui/card";
import { useStatus } from "@/hooks/queries";
import { useI18n } from "@/i18n";
import type { BridgeStatus } from "@/lib/api";
import { cn } from "@/lib/utils";

function splitDuration(totalSec: number): [number, number, number] {
  return [Math.floor(totalSec / 86400), Math.floor((totalSec % 86400) / 3600), Math.floor((totalSec % 3600) / 60)];
}

// Connection state as a dot, the way the IOTOWN admin status page shows services
function StatusDot({ connected }: { connected: boolean }) {
  const { t } = useI18n();
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 text-xs font-medium",
        connected ? "text-emerald-600 dark:text-emerald-400" : "text-destructive",
      )}
    >
      <span className="relative flex h-2.5 w-2.5">
        {connected && <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-50 animate-ping" />}
        <span
          className={cn(
            "relative inline-flex h-2.5 w-2.5 rounded-full ring-4",
            connected ? "bg-emerald-500 ring-emerald-500/20" : "bg-red-500 ring-red-500/20",
          )}
        />
      </span>
      {connected ? t.status.connected : t.status.disconnected}
    </span>
  );
}

// A stage of the flow, drawn like a node on the IOTOWN pipeline page; the bridge is the highlighted one
function FlowNode({ icon: Icon, label, state }: { icon: LucideIcon; label: string; state: "bridge" | "ok" | "down" }) {
  const tone = state === "bridge" ? "text-primary" : state === "down" ? "text-destructive" : "text-muted-foreground";
  return (
    <div className="relative">
      {state === "bridge" && <div className="absolute inset-0 -m-1 rounded-xl bg-primary/20 blur-md" />}
      <div
        className={cn(
          "relative flex h-16 w-16 sm:h-20 sm:w-20 flex-col items-center justify-center rounded-xl border-2 bg-background",
          state === "bridge" ? "border-primary shadow-lg shadow-primary/25" : state === "down" ? "border-destructive/60" : "border-border",
        )}
      >
        <Icon className={cn("h-6 w-6 sm:h-7 sm:w-7", tone)} />
        <span className={cn("mt-0.5 text-[10px] sm:text-xs font-medium", tone)}>{label}</span>
      </div>
    </div>
  );
}

// The line between two stages: a light sweeps along it in the direction messages went in the last minute,
// and it turns dashed red while that end is disconnected
function FlowLine({ ok, forward, backward }: { ok: boolean; forward: boolean; backward: boolean }) {
  if (!ok) return <div className="w-full border-t-2 border-dashed border-destructive/50" />;
  return (
    <div className="relative h-1 w-full">
      <div className="absolute inset-0 rounded-full bg-border" />
      <div className="absolute inset-0 overflow-hidden rounded-full">
        {forward && (
          <div className="absolute inset-y-0 left-0 w-1/2 rounded-full bg-linear-to-r from-transparent via-primary/60 to-transparent motion-safe:animate-pipeline-flow" />
        )}
        {backward && (
          <div className="absolute inset-y-0 left-0 w-1/2 rounded-full bg-linear-to-r from-transparent via-primary/60 to-transparent motion-safe:animate-pipeline-flow [animation-direction:reverse]" />
        )}
      </div>
    </div>
  );
}

function CountLine({ label, value }: { label: string; value: number }) {
  return (
    <p className="text-xs text-muted-foreground">
      {label} <span className="font-semibold tabular-nums text-foreground">{value.toLocaleString()}</span>
    </p>
  );
}

// ChirpStack -> bridge -> IOTOWN in the style of the IOTOWN pipeline page's flow; details under each stage
// (addresses are left out on phones, where they would wrap mid-word)
function FlowCard({ s }: { s: BridgeStatus }) {
  const { t } = useI18n();
  const cs = s.chirpstack.connected;
  const io = s.iotown.connected;
  return (
    <Card className="lg:col-span-2 overflow-hidden">
      <CardContent className="p-0">
        <div className="bg-muted/30 px-3 py-8 sm:px-6">
          <div className="grid grid-cols-[minmax(0,12rem)_minmax(1.5rem,8rem)_minmax(0,12rem)_minmax(1.5rem,8rem)_minmax(0,12rem)] justify-center items-center gap-y-4">
            <div className="flex justify-center">
              <FlowNode icon={Radio} label="ChirpStack" state={cs ? "ok" : "down"} />
            </div>
            <FlowLine ok={cs} forward={s.recentUplink} backward={s.recentDownlink} />
            <div className="flex justify-center">
              <FlowNode icon={ArrowRightLeft} label={t.status.bridge} state="bridge" />
            </div>
            <FlowLine ok={io} forward={s.recentUplink} backward={s.recentDownlink} />
            <div className="flex justify-center">
              <FlowNode icon={Server} label="IOTOWN" state={io ? "ok" : "down"} />
            </div>

            <div className="flex flex-col items-center gap-1 self-start text-center">
              <p className="hidden sm:block text-xs text-muted-foreground font-mono break-all">
                {s.chirpstack.host}:{s.chirpstack.port}
              </p>
              <StatusDot connected={cs} />
            </div>
            <div />
            <div className="flex flex-col items-center gap-0.5 self-start text-center">
              <CountLine label={t.status.uplink} value={s.uplinkCount} />
              <CountLine label={t.status.downlink} value={s.downlinkCount} />
            </div>
            <div />
            <div className="flex flex-col items-center gap-1 self-start text-center">
              <p className="hidden sm:block text-xs text-muted-foreground font-mono break-all">
                {s.iotown.host}:{s.iotown.port}
              </p>
              <StatusDot connected={io} />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function StatusPage() {
  const { t } = useI18n();
  const status = useStatus();
  if (status.isPending) return <PageLoading />;
  if (status.isError) return <LoadError error={status.error} />;
  const s = status.data;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <FlowCard s={s} />

      <Card>
        <IconCardHeader icon={<ChartColumn className="h-5 w-5" />} title={t.status.counters} description={t.status.countersHint} />
        <CardContent>
          <InfoRow label={t.status.uplinkCount}>{s.uplinkCount.toLocaleString()}</InfoRow>
          <InfoRow label={t.status.downlinkCount}>{s.downlinkCount.toLocaleString()}</InfoRow>
          <InfoRow label={t.status.queued}>{s.iotown.queued.toLocaleString()}</InfoRow>
          <InfoRow label={t.status.startedAt}>{new Date(s.startedAt).toLocaleString()}</InfoRow>
          <InfoRow label={t.status.uptime}>{t.common.duration(...splitDuration(s.uptimeSec))}</InfoRow>
          <InfoRow label={t.status.version}>{s.version}</InfoRow>
        </CardContent>
      </Card>

      <Card>
        <IconCardHeader icon={<TriangleAlert className="h-5 w-5" />} title={t.status.errors} description={t.status.errorsDesc} />
        <CardContent>
          {s.recentErrors.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t.status.noErrors}</p>
          ) : (
            <ul className="space-y-2">
              {[...s.recentErrors].reverse().slice(0, 10).map((line, i) => (
                <li key={i} className="text-xs font-mono break-all text-destructive">
                  {line}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
