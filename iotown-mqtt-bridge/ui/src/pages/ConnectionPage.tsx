import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Radio, Server, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { FieldError, IconCardHeader, LoadError, PageLoading, SettingRow } from "@/components/common";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useApplications, useBridgeConfig, useStatus } from "@/hooks/queries";
import { useI18n } from "@/i18n";
import { api, ApiError, type BridgeConfig, type Connection } from "@/lib/api";
import { errorMessage } from "@/lib/errors";

// Secrets are never sent back by the server: empty keeps the stored value, "clear" removes it
type Secret = { value: string; clear: boolean };
const keep: Secret = { value: "", clear: false };
const secretBody = (s: Secret) => (s.clear ? null : s.value || undefined);

// Trash icon that asks before removing a stored secret
function DeleteButton({ title, description, onConfirm }: { title: string; description: string; onConfirm: () => void }) {
  const { t } = useI18n();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="outline" size="icon" className="shrink-0">
          <Trash2 className="h-4 w-4" />
          <span className="sr-only">{t.common.delete}</span>
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{t.common.delete}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function SecretInput({ id, set, secret, onChange }: { id: string; set: boolean; secret: Secret; onChange: (s: Secret) => void }) {
  const { t } = useI18n();
  return (
    <div className="flex gap-2">
      <Input
        id={id}
        type="password"
        autoComplete="new-password"
        value={secret.value}
        disabled={secret.clear}
        placeholder={secret.clear ? t.connection.passwordNone : set ? t.connection.passwordKeep : t.connection.passwordNone}
        onChange={(e) => onChange({ value: e.target.value, clear: false })}
      />
      {set &&
        (secret.clear ? (
          <Button type="button" variant="outline" onClick={() => onChange(keep)}>
            {t.common.revert}
          </Button>
        ) : (
          <DeleteButton
            title={t.connection.deletePasswordTitle}
            description={t.connection.deletePasswordDesc}
            onConfirm={() => onChange({ value: "", clear: true })}
          />
        ))}
    </div>
  );
}

// The API key is required. A stored key shows only its last 4 characters; deleting it opens an
// empty field, and the form cannot be saved until a new key is entered.
type ApiKey = { replacing: boolean; value: string };

function ApiKeyInput({
  hint,
  apiKey,
  onChange,
  error,
}: {
  hint: string | null;
  apiKey: ApiKey;
  onChange: (k: ApiKey) => void;
  error?: string;
}) {
  const { t } = useI18n();
  const stored = hint !== null && !apiKey.replacing;
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        {stored ? (
          <>
            <div className="flex h-9 flex-1 items-center rounded-md border bg-muted/40 px-3 font-mono text-sm tracking-wider">
              ••••••••{hint}
            </div>
            <DeleteButton
              title={t.connection.deleteKeyTitle}
              description={t.connection.deleteKeyDesc}
              onConfirm={() => onChange({ replacing: true, value: "" })}
            />
          </>
        ) : (
          <>
            <Input
              id="token"
              type="password"
              autoComplete="off"
              value={apiKey.value}
              placeholder={t.connection.apiTokenPlaceholder}
              aria-invalid={error ? true : undefined}
              onChange={(e) => onChange({ replacing: apiKey.replacing, value: e.target.value })}
            />
            {hint !== null && (
              <Button type="button" variant="outline" onClick={() => onChange({ replacing: false, value: "" })}>
                {t.common.revert}
              </Button>
            )}
          </>
        )}
      </div>
      <FieldError message={error} />
    </div>
  );
}

function ConnectionStateText({ connected }: { connected?: boolean }) {
  const { t } = useI18n();
  if (connected === undefined) return null;
  return (
    <span className={connected ? "text-green-600" : "text-destructive"}>{connected ? t.status.connected : t.status.disconnected}</span>
  );
}

function ConnectionForm({ initial }: { initial: Connection }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const apps = useApplications();
  const status = useStatus();
  // ChirpStack: installed alongside (nothing to enter but the API key) or an external server
  const [external, setExternal] = useState(initial.chirpstack.external);
  const [csHost, setCsHost] = useState(initial.chirpstack.external ? initial.chirpstack.host : "");
  const [csPort, setCsPort] = useState(String(initial.chirpstack.external ? initial.chirpstack.port : 1883));
  const [csTls, setCsTls] = useState(initial.chirpstack.tls);
  const [csVerify, setCsVerify] = useState(initial.chirpstack.rejectUnauthorized);
  const [csUser, setCsUser] = useState(initial.chirpstack.username);
  const [csPass, setCsPass] = useState<Secret>(keep);
  const [apiUrl, setApiUrl] = useState(initial.chirpstack.external ? initial.chirpstackApi.url : "");
  const [csHostError, setCsHostError] = useState<string>();
  // IOTOWN: set at install time, so shown as a summary until "change" is pressed
  const [editIotown, setEditIotown] = useState(false);
  const [host, setHost] = useState(initial.iotown.host);
  const [port, setPort] = useState(String(initial.iotown.port));
  const [user, setUser] = useState(initial.iotown.username);
  const [pass, setPass] = useState<Secret>(keep);
  const [verify, setVerify] = useState(initial.iotown.rejectUnauthorized);
  // Drops what was typed and goes back to the summary
  const cancelIotown = () => {
    setHost(initial.iotown.host);
    setPort(String(initial.iotown.port));
    setUser(initial.iotown.username);
    setPass(keep);
    setVerify(initial.iotown.rejectUnauthorized);
    setEditIotown(false);
  };
  const [apiKey, setApiKey] = useState<ApiKey>({ replacing: false, value: "" });
  const [apiKeyError, setApiKeyError] = useState<string>();
  const [apiUrlError, setApiUrlError] = useState<string>();
  // A new key is needed when none is stored or the stored one was deleted
  const needsKey = !initial.chirpstackApi.tokenSet || apiKey.replacing;

  // The save bar shows only when something differs from what is saved; external ChirpStack fields count only while it is on
  const snapshot = (v: {
    external: boolean;
    cs: (string | boolean | Secret)[];
    iotown: (string | boolean | Secret)[];
    apiKey: ApiKey;
  }) => JSON.stringify([v.external, v.external ? v.cs : null, v.iotown, v.apiKey]);
  const dirty =
    snapshot({ external, cs: [csHost, csPort, csTls, csVerify, csUser, csPass, apiUrl], iotown: [host, port, user, pass, verify], apiKey }) !==
    snapshot({
      external: initial.chirpstack.external,
      cs: [
        initial.chirpstack.host,
        String(initial.chirpstack.port),
        initial.chirpstack.tls,
        initial.chirpstack.rejectUnauthorized,
        initial.chirpstack.username,
        keep,
        initial.chirpstackApi.url,
      ],
      iotown: [initial.iotown.host, String(initial.iotown.port), initial.iotown.username, keep, initial.iotown.rejectUnauthorized],
      apiKey: { replacing: false, value: "" },
    });

  // Back to the saved values, everywhere on the page
  const revert = () => {
    setExternal(initial.chirpstack.external);
    setCsHost(initial.chirpstack.external ? initial.chirpstack.host : "");
    setCsPort(String(initial.chirpstack.external ? initial.chirpstack.port : 1883));
    setCsTls(initial.chirpstack.tls);
    setCsVerify(initial.chirpstack.rejectUnauthorized);
    setCsUser(initial.chirpstack.username);
    setCsPass(keep);
    setApiUrl(initial.chirpstack.external ? initial.chirpstackApi.url : "");
    setCsHostError(undefined);
    setApiKey({ replacing: false, value: "" });
    setApiKeyError(undefined);
    setApiUrlError(undefined);
    cancelIotown();
  };

  const save = useMutation({
    mutationFn: () =>
      api<BridgeConfig>("/api/config/connection", {
        method: "PUT",
        body: {
          chirpstack: external
            ? {
                external: true,
                host: csHost.trim(),
                port: Number(csPort),
                tls: csTls,
                rejectUnauthorized: csVerify,
                username: csUser,
                password: secretBody(csPass),
              }
            : { external: false, username: "" },
          iotown: {
            host,
            port: Number(port),
            username: user,
            password: secretBody(pass),
            rejectUnauthorized: verify,
          },
          chirpstackApi: {
            url: external ? apiUrl.trim() : undefined,
            token: needsKey ? apiKey.value.trim() : undefined,
          },
        },
      }),
    onSuccess: (data) => {
      toast.success(t.connection.saved);
      // The form only remounts when the saved values change (e.g. not when the same key is entered again),
      // so leave the editing state here
      setCsPass(keep);
      setPass(keep);
      setEditIotown(false);
      setApiKey({ replacing: false, value: "" });
      setApiKeyError(undefined);
      setApiUrlError(undefined);
      queryClient.setQueryData(["config"], data);
      void queryClient.invalidateQueries({ queryKey: ["chirpstack"] });
      void queryClient.invalidateQueries({ queryKey: ["status"] });
    },
    // A new API address or key is checked by the bridge before saving; show why it failed next to that field
    onError: (err) => {
      const message = errorMessage(err, t);
      const code = err instanceof ApiError ? err.code : "";
      if (code === "CHIRPSTACK_API_KEY_INVALID" || code === "CHIRPSTACK_API_KEY_NOT_ADMIN") setApiKeyError(message);
      if (code === "CHIRPSTACK_API_UNREACHABLE" || code === "CHIRPSTACK_API_ERROR" || code === "INVALID_API_URL") setApiUrlError(message);
      toast.error(message);
    },
  });

  const csPortNum = Number(csPort);
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const keyMissing = needsKey && !apiKey.value.trim();
        const hostBad =
          external && (!csHost.trim() || /[\s/]/.test(csHost.trim()) || !Number.isInteger(csPortNum) || csPortNum < 1 || csPortNum > 65535);
        let urlBad = false;
        if (external) {
          try {
            urlBad = !/^https?:$/.test(new URL(apiUrl.trim()).protocol);
          } catch {
            urlBad = true;
          }
        }
        setApiKeyError(keyMissing ? t.errors.API_TOKEN_REQUIRED : undefined);
        setCsHostError(hostBad ? t.errors.INVALID_HOST : undefined);
        setApiUrlError(urlBad ? t.errors.INVALID_API_URL : undefined);
        if (!keyMissing && !hostBad && !urlBad) save.mutate();
      }}
    >
      <Card>
        <IconCardHeader
          icon={<Radio className="h-5 w-5" />}
          title={t.connection.chirpstack}
          description={external ? t.connection.chirpstackExternalDesc : t.connection.chirpstackLocalDesc}
        />
        <CardContent>
          {/* Fields keep a readable width; the card spans the page */}
          <div className="max-w-xl space-y-4">
            <SettingRow label={t.connection.externalChirpstack}>
              <Switch checked={external} onCheckedChange={setExternal} />
            </SettingRow>
            {external && (
              <>
                <div className="grid gap-4 grid-cols-[1fr_7rem]">
                  <div className="space-y-2">
                    <Label htmlFor="csHost">{t.connection.mqttHost}</Label>
                    <Input
                      id="csHost"
                      value={csHost}
                      aria-invalid={csHostError ? true : undefined}
                      onChange={(e) => {
                        setCsHost(e.target.value);
                        setCsHostError(undefined);
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="csPort">{t.connection.port}</Label>
                    <Input id="csPort" type="number" min={1} max={65535} value={csPort} onChange={(e) => setCsPort(e.target.value)} />
                  </div>
                </div>
                <FieldError message={csHostError} />
                <div className="space-y-2">
                  <Label htmlFor="csUser">{t.connection.username}</Label>
                  <Input id="csUser" value={csUser} onChange={(e) => setCsUser(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="csPass">{t.connection.password}</Label>
                  <SecretInput
                    id="csPass"
                    set={initial.chirpstack.external && initial.chirpstack.passwordSet}
                    secret={csPass}
                    onChange={setCsPass}
                  />
                </div>
                <SettingRow label={t.connection.tls}>
                  <Switch checked={csTls} onCheckedChange={setCsTls} />
                </SettingRow>
                {csTls && (
                  <SettingRow label={t.connection.verifyCert} description={t.connection.csVerifyCertDesc}>
                    <Switch checked={csVerify} onCheckedChange={setCsVerify} />
                  </SettingRow>
                )}
                <div className="space-y-2">
                  <Label htmlFor="apiUrl">{t.connection.apiUrl}</Label>
                  <Input
                    id="apiUrl"
                    className="font-mono"
                    placeholder="https://chirpstack.example.com:8090"
                    value={apiUrl}
                    aria-invalid={apiUrlError ? true : undefined}
                    onChange={(e) => {
                      setApiUrl(e.target.value);
                      setApiUrlError(undefined);
                    }}
                  />
                  <FieldError message={apiUrlError} />
                </div>
              </>
            )}
            {!external && <FieldError message={apiUrlError} />}
            <div className="space-y-2">
              <Label htmlFor="token">{t.connection.apiToken}</Label>
              <ApiKeyInput
                hint={initial.chirpstackApi.tokenHint}
                apiKey={apiKey}
                onChange={(k) => {
                  setApiKey(k);
                  setApiKeyError(undefined);
                }}
                error={apiKeyError}
              />
              <p className="text-sm text-muted-foreground">{t.connection.apiTokenHint}</p>
            </div>
            {/* State of the saved address and key; hidden while a new key or address is being entered */}
            {!apiKey.replacing && !apiKeyError && !apiUrlError && (
              <>
                {/* Also while the list is fetched again after a save */}
                {initial.chirpstackApi.tokenSet && apps.isFetching ? (
                  <p className="text-sm text-muted-foreground">{t.mapping.loadingList}</p>
                ) : (
                  <>
                    {apps.data?.configured && <p className="text-sm text-green-600">{t.connection.apiOk(apps.data.items.length)}</p>}
                    {apps.isError && <p className="text-sm text-destructive">{errorMessage(apps.error, t)}</p>}
                  </>
                )}
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <IconCardHeader icon={<Server className="h-5 w-5" />} title={t.connection.iotown} description={t.connection.iotownDesc} />
        <CardContent>
          {!editIotown ? (
            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-mono">
                  {initial.iotown.host}:{initial.iotown.port}
                </span>
                <span className="text-muted-foreground">·</span>
                <span>{initial.iotown.username}</span>
                <span className="text-muted-foreground">·</span>
                <ConnectionStateText connected={status.data?.iotown.connected} />
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => setEditIotown(true)}>
                {t.connection.change}
              </Button>
            </div>
          ) : (
            <div className="max-w-xl space-y-4">
              <div className="grid gap-4 grid-cols-[1fr_7rem]">
                <div className="space-y-2">
                  <Label htmlFor="host">{t.connection.host}</Label>
                  <Input id="host" value={host} onChange={(e) => setHost(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="port">{t.connection.port}</Label>
                  <Input id="port" type="number" min={1} max={65535} value={port} onChange={(e) => setPort(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="user">{t.connection.username}</Label>
                <Input id="user" value={user} onChange={(e) => setUser(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pass">{t.connection.password}</Label>
                <SecretInput id="pass" set={initial.iotown.passwordSet} secret={pass} onChange={setPass} />
              </div>
              <SettingRow label={t.connection.verifyCert} description={t.connection.verifyCertDesc}>
                <Switch checked={verify} onCheckedChange={setVerify} />
              </SettingRow>
              <Button type="button" variant="outline" size="sm" onClick={cancelIotown}>
                {t.connection.cancelChange}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {dirty && (
        <div className="sticky bottom-0 z-10 flex items-center justify-between gap-3 rounded-lg border bg-background/95 backdrop-blur p-3 shadow-lg">
          <span className="text-sm">{t.common.unsaved}</span>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={revert}>
              {t.common.revert}
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? t.common.saving : t.common.save}
            </Button>
          </div>
        </div>
      )}
    </form>
  );
}

export default function ConnectionPage() {
  const config = useBridgeConfig();
  if (config.isPending) return <PageLoading />;
  if (config.isError) return <LoadError error={config.error} />;
  // Remount with fresh values after every save
  return <ConnectionForm key={JSON.stringify(config.data.connection)} initial={config.data.connection} />;
}
