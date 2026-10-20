export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(path, {
    method: options.method ?? "GET",
    headers: options.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    credentials: "same-origin",
  });
  const text = await res.text();
  const data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!res.ok) {
    const issues = data.issues as { message?: string }[] | undefined;
    const code = (issues?.[0]?.message ?? (data.error as string | undefined)) || `HTTP_${res.status}`;
    throw new ApiError(res.status, code, (data.message as string | undefined) ?? code);
  }
  return data as T;
}

export interface Me {
  authenticated: boolean;
  username?: string;
  mustChangePassword?: boolean;
  version: string;
}

export interface BridgeStatus {
  startedAt: string;
  uptimeSec: number;
  chirpstack: { connected: boolean; host: string; port: number };
  iotown: { connected: boolean; host: string; port: number; queued: number };
  uplinkCount: number;
  downlinkCount: number;
  // A message went that way within the last minute
  recentUplink: boolean;
  recentDownlink: boolean;
  recentErrors: string[];
  version: string;
}

export interface Mapping {
  applications: { applicationId: string; groupId: string }[];
  defaultGroupId: string;
  excludeApplications: string[];
  gateways: { gatewayId: string; groupId: string }[];
  defaultGatewayGroupId: string;
  downlink: { defaultFPort: number; defaultConfirmed: boolean };
}

export interface Connection {
  chirpstack: { external: boolean; host: string; port: number; tls: boolean; rejectUnauthorized: boolean; username: string; passwordSet: boolean };
  iotown: { host: string; port: number; username: string; passwordSet: boolean; rejectUnauthorized: boolean };
  chirpstackApi: { url: string; tokenSet: boolean; tokenHint: string | null };
}

export type LogLevel = "error" | "warn" | "info" | "debug";

export interface BridgeConfig {
  mapping: Mapping;
  connection: Connection;
  logLevel: LogLevel;
}

export interface NamedItem {
  id: string;
  name: string;
  tenant: string;
}

export interface NamedList {
  configured: boolean;
  items: NamedItem[];
}
