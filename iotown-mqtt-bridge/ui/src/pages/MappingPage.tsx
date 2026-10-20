import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, ChevronRight, Cpu, KeyRound, Plus, RadioTower, Trash2, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Controller, useFieldArray, useForm, type FieldError as RhfFieldError } from "react-hook-form";
import { Link } from "react-router";
import { toast } from "sonner";
import { z } from "zod";
import { EntityPicker } from "@/components/EntityPicker";
import { FieldError, IconCardHeader, LoadError, PageLoading, SettingRow } from "@/components/common";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { useApplications, useBridgeConfig, useGateways } from "@/hooks/queries";
import { useI18n } from "@/i18n";
import { api, type BridgeConfig, type Mapping, type NamedList } from "@/lib/api";
import { errorMessage } from "@/lib/errors";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const GATEWAY_ID = /^[0-9a-f]{16}$/;
// IOTOWN group IDs are UUIDs; the placeholder shows their shape and length
const GROUP_PLACEHOLDER = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx";

interface FormValues {
  applications: { applicationId: string; groupId: string }[];
  defaultGroupId: string;
  excludeApplications: { appId: string }[];
  gateways: { gatewayId: string; groupId: string }[];
  defaultGatewayGroupId: string;
  defaultFPort: number;
  defaultConfirmed: boolean;
}

function toForm(m: Mapping): FormValues {
  return {
    applications: m.applications,
    defaultGroupId: m.defaultGroupId,
    excludeApplications: m.excludeApplications.map((appId) => ({ appId })),
    gateways: m.gateways,
    defaultGatewayGroupId: m.defaultGatewayGroupId,
    defaultFPort: m.downlink.defaultFPort,
    defaultConfirmed: m.downlink.defaultConfirmed,
  };
}

function toMapping(v: FormValues): Mapping {
  return {
    applications: v.applications.map((a) => ({ applicationId: a.applicationId, groupId: a.groupId.trim().toLowerCase() })),
    defaultGroupId: v.defaultGroupId.trim().toLowerCase(),
    excludeApplications: v.excludeApplications.map((e) => e.appId),
    gateways: v.gateways.map((g) => ({ gatewayId: g.gatewayId, groupId: g.groupId.trim().toLowerCase() })),
    defaultGatewayGroupId: v.defaultGatewayGroupId.trim().toLowerCase(),
    downlink: { defaultFPort: v.defaultFPort, defaultConfirmed: v.defaultConfirmed },
  };
}

// Applications and gateways are picked from the ChirpStack API's lists only
function listReady(q: { isError: boolean; data?: NamedList }): boolean {
  return !q.isError && q.data?.configured === true;
}

// One "source → IOTOWN group" line; the fallback line uses a fixed label instead of a picker
function MappingRow({ source, group, onDelete, fallback }: { source: ReactNode; group: ReactNode; onDelete?: () => void; fallback?: boolean }) {
  return (
    <div
      className={
        fallback
          ? "grid gap-2 sm:grid-cols-[1fr_auto_1fr_2.25rem] items-start rounded-lg border border-dashed bg-muted/40 p-3"
          : "grid gap-2 sm:grid-cols-[1fr_auto_1fr_2.25rem] items-start"
      }
    >
      <div className="min-w-0">{source}</div>
      <ArrowRight className="hidden sm:block h-4 w-4 mt-2.5 text-muted-foreground" />
      <div className="min-w-0">{group}</div>
      {onDelete ? (
        <Button type="button" variant="ghost" size="icon" onClick={onDelete}>
          <Trash2 className="h-4 w-4" />
        </Button>
      ) : (
        <span />
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function HeaderRow({ left, right }: { left: string; right: string }) {
  return (
    <div className="hidden sm:grid sm:grid-cols-[1fr_auto_1fr_2.25rem] gap-2 px-0.5 text-xs font-medium text-muted-foreground">
      <span>{left}</span>
      <span className="w-4" />
      <span>{right}</span>
      <span />
    </div>
  );
}

export default function MappingPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const config = useBridgeConfig();
  const apps = useApplications();
  const gws = useGateways();
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const issue = (key: string) => t.errors[key] ?? key;
  const groupId = z
    .string()
    .trim()
    .toLowerCase()
    .regex(UUID, issue("INVALID_GROUP_ID"));
  // Empty: data without a mapping is not sent
  const defaultGroupId = z
    .string()
    .trim()
    .toLowerCase()
    .refine((v) => v === "" || UUID.test(v), issue("INVALID_GROUP_ID"));
  const schema = z
    .object({
      applications: z.array(
        z.object({
          applicationId: z.string().regex(UUID, issue("INVALID_APPLICATION_ID")),
          groupId,
        }),
      ),
      defaultGroupId,
      excludeApplications: z.array(z.object({ appId: z.string() })),
      gateways: z.array(
        z.object({
          gatewayId: z.string().regex(GATEWAY_ID, issue("INVALID_GATEWAY_ID")),
          groupId,
        }),
      ),
      defaultGatewayGroupId: defaultGroupId,
      defaultFPort: z.number({ error: t.mapping.fPortRange }).int(t.mapping.fPortRange).min(1, t.mapping.fPortRange).max(223, t.mapping.fPortRange),
      defaultConfirmed: z.boolean(),
    })
    .superRefine((v, ctx) => {
      const seenApps = new Set<string>();
      v.applications.forEach((a, i) => {
        if (a.applicationId && seenApps.has(a.applicationId)) {
          ctx.addIssue({ code: "custom", path: ["applications", i, "applicationId"], message: issue("DUPLICATE_APPLICATION") });
        }
        seenApps.add(a.applicationId);
      });
      const seenGws = new Set<string>();
      v.gateways.forEach((g, i) => {
        if (g.gatewayId && seenGws.has(g.gatewayId)) {
          ctx.addIssue({ code: "custom", path: ["gateways", i, "gatewayId"], message: issue("DUPLICATE_GATEWAY") });
        }
        seenGws.add(g.gatewayId);
      });
    });

  const form = useForm<FormValues>({ resolver: zodResolver(schema) });
  const appRows = useFieldArray({ control: form.control, name: "applications" });
  const excluded = useFieldArray({ control: form.control, name: "excludeApplications" });
  const gwRows = useFieldArray({ control: form.control, name: "gateways" });

  useEffect(() => {
    if (config.data) form.reset(toForm(config.data.mapping));
  }, [config.data, form]);

  const save = useMutation({
    mutationFn: (v: FormValues) => api<BridgeConfig>("/api/config/mapping", { method: "PUT", body: toMapping(v) }),
    onSuccess: (data) => {
      toast.success(t.mapping.saved);
      queryClient.setQueryData(["config"], data);
      form.reset(toForm(data.mapping));
    },
    onError: (err) => toast.error(errorMessage(err, t)),
  });

  if (config.isPending) return <PageLoading />;
  if (config.isError) return <LoadError error={config.error} />;

  const appItems = apps.data?.items ?? [];
  const gwItems = gws.data?.items ?? [];
  const appsReady = listReady(apps);
  const gwsReady = listReady(gws);
  // Once the list request has answered: no API key, or the API failed
  const apiProblem = apps.isError ? "error" : apps.data && !apps.data.configured ? "missing" : null;
  const errors = form.formState.errors;
  const rowError = (e?: { applicationId?: RhfFieldError; gatewayId?: RhfFieldError; groupId?: RhfFieldError }) =>
    e?.applicationId?.message ?? e?.gatewayId?.message ?? e?.groupId?.message;

  return (
    <form noValidate onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-4 pb-20">
      {apiProblem && (
        <Alert>
          <KeyRound className="h-4 w-4" />
          <AlertTitle>{apiProblem === "missing" ? t.mapping.apiRequiredTitle : t.mapping.apiErrorTitle}</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>{apiProblem === "missing" ? t.mapping.apiRequiredDesc : errorMessage(apps.error, t)}</span>
            <Button asChild type="button" variant="outline" size="sm">
              <Link to="/connection">{t.mapping.goConnection}</Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}
      <Card>
        <IconCardHeader icon={<Cpu className="h-5 w-5" />} title={t.mapping.devicesTitle} description={t.mapping.devicesDesc} />
        <CardContent className="space-y-6">
          <Section title={t.mapping.applications}>
            {appRows.fields.length > 0 && <HeaderRow left={t.mapping.application} right={t.mapping.group} />}
            {appRows.fields.map((field, i) => (
              <div key={field.id} className="space-y-1">
                <MappingRow
                  source={
                    <Controller
                      control={form.control}
                      name={`applications.${i}.applicationId`}
                      render={({ field: f, fieldState }) => (
                        <EntityPicker
                          value={f.value}
                          onChange={f.onChange}
                          items={appItems}
                          placeholder={apps.isPending ? t.mapping.loadingList : t.mapping.pickApplication}
                          disabled={!appsReady}
                          invalid={Boolean(fieldState.error)}
                        />
                      )}
                    />
                  }
                  group={<Input className="font-mono" placeholder={GROUP_PLACEHOLDER} {...form.register(`applications.${i}.groupId`)} />}
                  onDelete={() => appRows.remove(i)}
                />
                <FieldError message={rowError(errors.applications?.[i])} />
              </div>
            ))}
            <MappingRow
              fallback
              source={<p className="text-sm font-medium py-2">{t.mapping.otherApplications}</p>}
              group={<Input className="font-mono bg-background" placeholder={GROUP_PLACEHOLDER} {...form.register("defaultGroupId")} />}
            />
            <FieldError message={errors.defaultGroupId?.message} />
            <p className="text-xs text-muted-foreground">{t.mapping.otherApplicationsHint}</p>
            <Button type="button" variant="outline" size="sm" disabled={!appsReady} onClick={() => appRows.append({ applicationId: "", groupId: "" })}>
              <Plus className="h-4 w-4" />
              {t.mapping.add}
            </Button>
          </Section>

          <Separator />

          {/* Less common settings, folded away; opened when a value there needs fixing */}
          <details className="group" open={advancedOpen || Boolean(errors.defaultFPort)} onToggle={(e) => setAdvancedOpen(e.currentTarget.open)}>
            <summary className="flex cursor-pointer select-none list-none items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
              <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" />
              {t.common.advanced}
            </summary>
            <div className="mt-4 space-y-6 pl-6">
            <Section title={t.mapping.exclude}>
              {excluded.fields.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {excluded.fields.map((field, i) => {
                    const item = appItems.find((a) => a.id === field.appId);
                    return (
                      <span key={field.id} className="inline-flex items-center gap-2 rounded-full border bg-muted/40 pl-3 pr-1 py-1 text-sm">
                        <span className="flex flex-col leading-tight">
                          <span>{item?.name ?? t.mapping.unknownName}</span>
                          <span className="font-mono text-[11px] text-muted-foreground">{field.appId}</span>
                        </span>
                        <Button type="button" variant="ghost" size="icon-sm" onClick={() => excluded.remove(i)}>
                          <X className="h-3.5 w-3.5" />
                          <span className="sr-only">{t.common.delete}</span>
                        </Button>
                      </span>
                    );
                  })}
                </div>
              )}
              <div className="sm:w-1/2">
                <EntityPicker
                  value=""
                  onChange={(id) => {
                    if (!form.getValues("excludeApplications").some((e) => e.appId === id)) excluded.append({ appId: id });
                  }}
                  items={appItems}
                  placeholder={apps.isPending ? t.mapping.loadingList : t.mapping.excludeAdd}
                  disabled={!appsReady}
                />
              </div>
            </Section>

            <Separator />

            <Section title={t.mapping.downlink}>
              <div className="rounded-lg border px-4 divide-y">
                <SettingRow className="py-3" label={t.mapping.fPort}>
                  <Input
                    id="defaultFPort"
                    type="number"
                    min={1}
                    max={223}
                    className="w-24 shrink-0 text-right"
                    aria-invalid={errors.defaultFPort ? true : undefined}
                    {...form.register("defaultFPort", { valueAsNumber: true })}
                  />
                </SettingRow>
                <SettingRow className="py-3" label={t.mapping.confirmed}>
                  <Controller
                    control={form.control}
                    name="defaultConfirmed"
                    render={({ field }) => <Switch checked={field.value} onCheckedChange={field.onChange} />}
                  />
                </SettingRow>
              </div>
              <FieldError message={errors.defaultFPort?.message} />
            </Section>
            </div>
          </details>
        </CardContent>
      </Card>

      <Card>
        <IconCardHeader icon={<RadioTower className="h-5 w-5" />} title={t.mapping.gatewaysTitle} description={t.mapping.gatewaysGroupDesc} />
        <CardContent className="space-y-6">
          <Section title={t.mapping.gateways}>
            {gwRows.fields.length > 0 && <HeaderRow left={t.mapping.gateway} right={t.mapping.group} />}
            {gwRows.fields.map((field, i) => (
              <div key={field.id} className="space-y-1">
                <MappingRow
                  source={
                    <Controller
                      control={form.control}
                      name={`gateways.${i}.gatewayId`}
                      render={({ field: f, fieldState }) => (
                        <EntityPicker
                          value={f.value}
                          onChange={f.onChange}
                          items={gwItems}
                          placeholder={gws.isPending ? t.mapping.loadingList : t.mapping.pickGateway}
                          disabled={!gwsReady}
                          invalid={Boolean(fieldState.error)}
                        />
                      )}
                    />
                  }
                  group={<Input className="font-mono" placeholder={GROUP_PLACEHOLDER} {...form.register(`gateways.${i}.groupId`)} />}
                  onDelete={() => gwRows.remove(i)}
                />
                <FieldError message={rowError(errors.gateways?.[i])} />
              </div>
            ))}
            <MappingRow
              fallback
              source={<p className="text-sm font-medium py-2">{t.mapping.otherGateways}</p>}
              group={<Input className="font-mono bg-background" placeholder={GROUP_PLACEHOLDER} {...form.register("defaultGatewayGroupId")} />}
            />
            <FieldError message={errors.defaultGatewayGroupId?.message} />
            <p className="text-xs text-muted-foreground">{t.mapping.otherGatewaysHint}</p>
            <Button type="button" variant="outline" size="sm" disabled={!gwsReady} onClick={() => gwRows.append({ gatewayId: "", groupId: "" })}>
              <Plus className="h-4 w-4" />
              {t.mapping.add}
            </Button>
          </Section>
        </CardContent>
      </Card>

      {form.formState.isDirty && (
        <div className="sticky bottom-0 z-10 flex items-center justify-between gap-3 rounded-lg border bg-background/95 backdrop-blur p-3 shadow-lg">
          <span className="text-sm">{t.common.unsaved}</span>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => config.data && form.reset(toForm(config.data.mapping))}>
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
