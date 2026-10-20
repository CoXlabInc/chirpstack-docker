import { ArrowDown } from "lucide-react";
import { useLayoutEffect, useRef } from "react";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";

export type StreamStatus = "live" | "connecting" | "closed";

// "manual": locked with the lock button, stays until unlocked. "auto": locked by scrolling up,
// released again when the view is scrolled back to the bottom.
export type ScrollLock = "off" | "manual" | "auto";

// Bridge log lines look like "[2026-10-16T08:16:20.209Z] [ERROR] message"
const LINE = /^\[(\d{4}-\d{2}-\d{2}T[\d:.]+Z)\] \[(\w+)\] (.*)$/s;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function splitLine(line: string): { time: string | null; level: string; text: string } {
  const m = LINE.exec(line);
  if (!m) return { time: null, level: "", text: line };
  const d = new Date(m[1] ?? "");
  const time = Number.isNaN(d.getTime())
    ? (m[1] ?? "")
    : `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  return { time, level: m[2] ?? "", text: m[3] ?? "" };
}

function levelClass(level: string): string {
  if (level === "ERROR") return "text-red-400";
  if (level === "WARN") return "text-yellow-300";
  if (level === "DEBUG") return "text-zinc-500";
  return "text-zinc-300";
}

const STATUS_STYLE: Record<StreamStatus, string> = {
  live: "bg-green-500 animate-pulse",
  connecting: "bg-yellow-500",
  closed: "bg-red-500",
};

// Dark console in the style of the IOTOWN pipeline parser's Logs panel. Follows new lines unless the
// scroll is locked; new lines still arrive while locked.
export function LogConsole({
  lines,
  status,
  lock,
  onLockChange,
}: {
  lines: string[];
  status: StreamStatus;
  lock: ScrollLock;
  onLockChange: (lock: ScrollLock) => void;
}) {
  const { t } = useI18n();
  const bodyRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (el && lock === "off") el.scrollTop = el.scrollHeight;
  }, [lines, lock]);

  const onScroll = () => {
    const el = bodyRef.current;
    if (!el) return;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 24;
    if (!atBottom && lock === "off") onLockChange("auto");
    if (atBottom && lock === "auto") onLockChange("off");
  };

  return (
    <div className="relative flex flex-col rounded-lg bg-zinc-950 border border-zinc-800 overflow-hidden font-mono text-xs">
      <div className="flex items-center gap-3 px-3 py-2 bg-zinc-900 border-b border-zinc-800 shrink-0">
        <span className="flex items-center gap-1.5 text-zinc-400">
          <span className={cn("h-2 w-2 rounded-full", STATUS_STYLE[status])} />
          {t.logs.status[status]}
        </span>
        <span className="ml-auto text-zinc-600">{t.logs.lineCount(lines.length)}</span>
      </div>
      <div ref={bodyRef} onScroll={onScroll} className="h-[60vh] overflow-y-auto p-3 leading-relaxed">
        {lines.length === 0 ? (
          <span className="text-zinc-600">{t.logs.empty}</span>
        ) : (
          lines.map((line, i) => {
            const { time, level, text } = splitLine(line);
            return (
              <div key={i} className="flex gap-2 hover:bg-zinc-900/80">
                <span className="text-zinc-700 select-none">›</span>
                <span className="whitespace-pre-wrap break-all">
                  {time && <span className="text-zinc-500 mr-2">{time}</span>}
                  {level && <span className={`${levelClass(level)} mr-2`}>{level.padEnd(5)}</span>}
                  <span className={levelClass(level)}>{text}</span>
                </span>
              </div>
            );
          })
        )}
      </div>
      {lock !== "off" && (
        <button
          type="button"
          onClick={() => onLockChange("off")}
          className="absolute bottom-3 right-4 flex items-center gap-1 rounded-full bg-zinc-800 px-3 py-1.5 text-zinc-200 shadow-lg hover:bg-zinc-700"
        >
          <ArrowDown className="h-3.5 w-3.5" />
          {t.logs.jumpToLatest}
        </button>
      )}
    </div>
  );
}
