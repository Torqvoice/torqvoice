"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  Plus,
  Pencil,
  Trash2,
  Send,
  Webhook as WebhookIcon,
  Copy,
  Check,
  RefreshCw,
  History,
  ShieldCheck,
  AlertCircle,
  PauseCircle,
  Eye,
  BookOpen,
  PlayCircle,
} from "lucide-react";
import {
  createWebhook,
  updateWebhook,
  toggleWebhook,
  deleteWebhook,
  rotateWebhookSecret,
  sendTestWebhook,
  getWebhookDeliveries,
  retryWebhookDelivery,
  getDeliveryPayload,
} from "@/features/webhooks/Actions/webhookActions";
import { WEBHOOK_EVENT_GROUPS } from "@/features/webhooks/Schema/webhookSchema";
import {
  SAMPLE_PAYLOADS,
  buildSampleEnvelope,
} from "@/features/webhooks/Lib/samples";
import { useSettingsPermission } from "../settings-permission-context";

type Webhook = {
  id: string;
  name: string;
  url: string;
  description: string | null;
  events: string[];
  isActive: boolean;
  autoDisabled: boolean;
  lastTriggeredAt: Date | null;
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  failureCount: number;
  deliveryCount: number;
  createdAt: Date;
};

type Delivery = {
  id: string;
  event: string;
  status: string;
  statusCode: number | null;
  attempt: number;
  maxAttempts: number;
  errorMessage: string | null;
  durationMs: number | null;
  createdAt: Date;
  deliveredAt: Date | null;
  nextRetryAt: Date | null;
};

interface Props {
  webhooks: Webhook[];
}

export function WebhooksSettings({ webhooks }: Props) {
  const t = useTranslations("settings.webhooks");
  const router = useRouter();
  const { canEdit } = useSettingsPermission();

  const [tab, setTab] = useState<"webhooks" | "reference">("webhooks");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Webhook | null>(null);
  const [createdSecret, setCreatedSecret] = useState<{
    name: string;
    secret: string;
  } | null>(null);
  const [deliveriesFor, setDeliveriesFor] = useState<Webhook | null>(null);

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (w: Webhook) => {
    setEditing(w);
    setDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {t("subtitle")}
          </p>
        </div>
        {canEdit && tab === "webhooks" && (
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            {t("create")}
          </Button>
        )}
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "webhooks" | "reference")}>
        <TabsList>
          <TabsTrigger value="webhooks">
            <WebhookIcon className="mr-2 h-4 w-4" />
            {t("tabWebhooks")}
            {webhooks.length > 0 && (
              <Badge variant="secondary" className="ml-2">{webhooks.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="reference">
            <BookOpen className="mr-2 h-4 w-4" />
            {t("tabReference")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="webhooks" className="mt-4 space-y-4">
          {webhooks.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                  <WebhookIcon className="h-6 w-6 text-muted-foreground" />
                </div>
                <h3 className="mt-4 text-base font-semibold">{t("emptyTitle")}</h3>
                <p className="mt-1 max-w-md text-sm text-muted-foreground">
                  {t("emptyDescription")}
                </p>
                {canEdit && (
                  <Button className="mt-4" onClick={openCreate}>
                    <Plus className="mr-2 h-4 w-4" />
                    {t("create")}
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3">
              {webhooks.map((w) => (
                <WebhookRow
                  key={w.id}
                  webhook={w}
                  canEdit={canEdit}
                  onEdit={() => openEdit(w)}
                  onShowDeliveries={() => setDeliveriesFor(w)}
                  onRefresh={() => router.refresh()}
                />
              ))}
            </div>
          )}

          <SignatureHelpCard />
        </TabsContent>

        <TabsContent value="reference" className="mt-4">
          <EventsReference />
        </TabsContent>
      </Tabs>

      {dialogOpen && (
        <WebhookFormDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          editing={editing}
          onCreated={(payload) => {
            setCreatedSecret({ name: payload.name, secret: payload.secret });
            setDialogOpen(false);
            router.refresh();
          }}
          onUpdated={() => {
            setDialogOpen(false);
            router.refresh();
          }}
        />
      )}

      {createdSecret && (
        <SecretRevealDialog
          name={createdSecret.name}
          secret={createdSecret.secret}
          onClose={() => setCreatedSecret(null)}
        />
      )}

      {deliveriesFor && (
        <DeliveriesSheet
          webhook={deliveriesFor}
          onClose={() => setDeliveriesFor(null)}
        />
      )}
    </div>
  );
}

// --------------- Row ---------------

function WebhookRow({
  webhook,
  canEdit,
  onEdit,
  onShowDeliveries,
  onRefresh,
}: {
  webhook: Webhook;
  canEdit: boolean;
  onEdit: () => void;
  onShowDeliveries: () => void;
  onRefresh: () => void;
}) {
  const t = useTranslations("settings.webhooks");
  const [isPending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [rotated, setRotated] = useState<string | null>(null);
  const [urlCopied, setUrlCopied] = useState(false);

  const copyUrl = async () => {
    await navigator.clipboard.writeText(webhook.url);
    setUrlCopied(true);
    setTimeout(() => setUrlCopied(false), 1500);
  };

  const handleToggle = () =>
    startTransition(async () => {
      const r = await toggleWebhook(webhook.id);
      if (r.success) {
        toast.success(r.data?.isActive ? t("resumed") : t("paused"));
        onRefresh();
      } else {
        toast.error(r.error || t("toggleFailed"));
      }
    });

  const handleTest = () =>
    startTransition(async () => {
      const r = await sendTestWebhook(webhook.id);
      if (r.success) {
        toast.success(t("testSent"));
        onRefresh();
      } else {
        toast.error(r.error || t("testFailed"));
      }
    });

  const handleDelete = () =>
    startTransition(async () => {
      const r = await deleteWebhook(webhook.id);
      if (r.success) {
        toast.success(t("deleted"));
        setConfirmDelete(false);
        onRefresh();
      } else {
        toast.error(r.error || t("deleteFailed"));
      }
    });

  const handleRotate = () =>
    startTransition(async () => {
      const r = await rotateWebhookSecret(webhook.id);
      if (r.success && r.data) {
        setRotated(r.data.secret);
        setConfirmRotate(false);
      } else {
        toast.error(r.error || t("rotateFailed"));
      }
    });

  const status =
    webhook.autoDisabled
      ? "auto_disabled"
      : !webhook.isActive
        ? "paused"
        : webhook.lastFailureAt && webhook.failureCount > 0
          ? "failing"
          : webhook.lastSuccessAt
            ? "ok"
            : "new";

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        {webhook.autoDisabled && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
            <div className="flex items-center gap-2">
              <PauseCircle className="h-4 w-4 shrink-0" />
              <span>{t("autoDisabledBanner")}</span>
            </div>
            {canEdit && (
              <Button size="sm" variant="outline" onClick={handleToggle} disabled={isPending}>
                <PlayCircle className="mr-2 h-3.5 w-3.5" />
                {t("reEnable")}
              </Button>
            )}
          </div>
        )}

        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium truncate">{webhook.name}</p>
              {status === "ok" && (
                <Badge variant="outline" className="border-emerald-500/30 text-emerald-600">
                  <ShieldCheck className="mr-1 h-3 w-3" />
                  {t("statusOk")}
                </Badge>
              )}
              {status === "failing" && (
                <Badge variant="outline" className="border-red-500/30 text-red-600">
                  <AlertCircle className="mr-1 h-3 w-3" />
                  {t("statusFailing", { count: webhook.failureCount })}
                </Badge>
              )}
              {status === "paused" && !webhook.autoDisabled && (
                <Badge variant="secondary">{t("paused")}</Badge>
              )}
              {status === "auto_disabled" && (
                <Badge variant="outline" className="border-amber-500/30 text-amber-600">
                  <PauseCircle className="mr-1 h-3 w-3" />
                  {t("autoDisabled")}
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-1">
              <code className="truncate font-mono text-xs text-muted-foreground">
                {webhook.url}
              </code>
              <Button
                size="sm"
                variant="ghost"
                onClick={copyUrl}
                className="h-6 w-6 p-0"
                title={t("copyUrl")}
              >
                {urlCopied ? (
                  <Check className="h-3 w-3 text-emerald-600" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </Button>
            </div>

            {webhook.description && (
              <p className="text-xs text-muted-foreground">{webhook.description}</p>
            )}

            <div className="flex flex-wrap gap-1.5">
              {webhook.events.includes("*") ? (
                <Badge variant="secondary" className="font-mono text-[10px]">
                  {t("subscribeToAll")}
                </Badge>
              ) : (
                <>
                  {webhook.events.slice(0, 6).map((e) => (
                    <Badge key={e} variant="secondary" className="font-mono text-[10px]">
                      {e}
                    </Badge>
                  ))}
                  {webhook.events.length > 6 && (
                    <Badge variant="outline" className="text-[10px]">
                      +{webhook.events.length - 6}
                    </Badge>
                  )}
                </>
              )}
            </div>

            {webhook.lastTriggeredAt && (
              <p className="text-xs text-muted-foreground">
                {t("lastDelivery", {
                  when: new Date(webhook.lastTriggeredAt).toLocaleString(),
                })}{" "}
                · {t("totalDeliveries", { count: webhook.deliveryCount })}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Switch
              checked={webhook.isActive}
              onCheckedChange={handleToggle}
              disabled={!canEdit || isPending}
              aria-label={t("toggleAria")}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={onShowDeliveries}
              disabled={isPending}
            >
              <History className="mr-2 h-4 w-4" />
              {t("deliveries")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleTest}
              disabled={!canEdit || isPending}
            >
              <Send className="mr-2 h-4 w-4" />
              {t("sendTest")}
            </Button>
            {canEdit && (
              <>
                <Button variant="outline" size="sm" onClick={onEdit} disabled={isPending}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmRotate(true)}
                  disabled={isPending}
                  title={t("rotateSecret")}
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmDelete(true)}
                  disabled={isPending}
                  className="text-red-600 hover:text-red-700"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        </div>
      </CardContent>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("confirmDeleteTitle")}</DialogTitle>
            <DialogDescription>
              {t("confirmDeleteDescription", { name: webhook.name })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmDelete(false)}
              disabled={isPending}
            >
              {t("cancel")}
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={confirmRotate || !!rotated}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmRotate(false);
            if (rotated) {
              setRotated(null);
              onRefresh();
            }
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{rotated ? t("secretRotated") : t("confirmRotateTitle")}</DialogTitle>
            <DialogDescription>
              {rotated ? t("secretRotatedDescription") : t("confirmRotateDescription")}
            </DialogDescription>
          </DialogHeader>
          {rotated && <SecretBlock value={rotated} />}
          <DialogFooter>
            {rotated ? (
              <Button onClick={() => { setRotated(null); onRefresh(); }}>{t("done")}</Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={() => setConfirmRotate(false)}
                  disabled={isPending}
                >
                  {t("cancel")}
                </Button>
                <Button onClick={handleRotate} disabled={isPending}>
                  {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t("rotate")}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// --------------- Form Dialog ---------------

function WebhookFormDialog({
  open,
  onOpenChange,
  editing,
  onCreated,
  onUpdated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: Webhook | null;
  onCreated: (payload: { name: string; secret: string }) => void;
  onUpdated: () => void;
}) {
  const t = useTranslations("settings.webhooks");
  const [isPending, startTransition] = useTransition();

  const [name, setName] = useState(editing?.name || "");
  const [url, setUrl] = useState(editing?.url || "");
  const [description, setDescription] = useState(editing?.description || "");
  const [events, setEvents] = useState<string[]>(
    editing?.events && !editing.events.includes("*") ? editing.events : [],
  );
  const [allEvents, setAllEvents] = useState(editing?.events.includes("*") ?? false);

  const toggleEvent = (e: string) => {
    setEvents((prev) =>
      prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e],
    );
  };

  const toggleGroup = (group: readonly string[]) => {
    const allSelected = group.every((e) => events.includes(e));
    setEvents((prev) =>
      allSelected
        ? prev.filter((e) => !group.includes(e))
        : Array.from(new Set([...prev, ...group])),
    );
  };

  const submit = () => {
    const finalEvents = allEvents ? ["*"] : events;
    if (finalEvents.length === 0) {
      toast.error(t("selectAtLeastOneEvent"));
      return;
    }
    startTransition(async () => {
      const payload = {
        name: name.trim(),
        url: url.trim(),
        description: description.trim() || null,
        events: finalEvents,
      };
      if (editing) {
        const r = await updateWebhook({ ...payload, id: editing.id });
        if (r.success) {
          toast.success(t("updated"));
          onUpdated();
        } else {
          toast.error(r.error || t("saveFailed"));
        }
      } else {
        const r = await createWebhook(payload);
        if (r.success && r.data) {
          toast.success(t("created"));
          onCreated({ name: r.data.name, secret: r.data.secret });
        } else {
          toast.error(r.error || t("saveFailed"));
        }
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? t("editTitle") : t("createTitle")}</DialogTitle>
          <DialogDescription>{t("createDescription")}</DialogDescription>
        </DialogHeader>

        <div className="max-h-[65vh] space-y-5 overflow-y-auto pr-1">
          <div className="space-y-2">
            <Label htmlFor="webhook-name">{t("name")}</Label>
            <Input
              id="webhook-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("namePlaceholder")}
              maxLength={100}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="webhook-url">{t("url")}</Label>
            <Input
              id="webhook-url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/hooks/torqvoice"
              maxLength={2048}
            />
            <p className="text-xs text-muted-foreground">{t("urlHint")}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="webhook-description">{t("description")}</Label>
            <Textarea
              id="webhook-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              maxLength={500}
            />
          </div>

          <Separator />

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <Label>{t("events")}</Label>
                <p className="text-xs text-muted-foreground">{t("eventsHint")}</p>
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="all-events" className="text-sm font-normal">
                  {t("subscribeToAll")}
                </Label>
                <Switch
                  id="all-events"
                  checked={allEvents}
                  onCheckedChange={(v) => {
                    setAllEvents(v);
                    if (v) setEvents([]);
                  }}
                />
              </div>
            </div>

            {!allEvents && (
              <div className="space-y-4 rounded-lg border p-3">
                {WEBHOOK_EVENT_GROUPS.map((g) => {
                  const allSelected = g.events.every((e) =>
                    events.includes(e as string),
                  );
                  return (
                    <div key={g.key} className="space-y-2">
                      <button
                        type="button"
                        onClick={() => toggleGroup(g.events as readonly string[])}
                        className="text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
                      >
                        {t(`groups.${g.key}`)} {allSelected ? "✓" : ""}
                      </button>
                      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                        {g.events.map((e) => (
                          <label
                            key={e}
                            className="flex cursor-pointer items-center gap-2 rounded p-1 text-sm hover:bg-muted/50"
                          >
                            <Checkbox
                              checked={events.includes(e as string)}
                              onCheckedChange={() => toggleEvent(e as string)}
                            />
                            <span className="font-mono text-xs">{e}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            {t("cancel")}
          </Button>
          <Button onClick={submit} disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {editing ? t("save") : t("create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --------------- Secret Reveal ---------------

function SecretRevealDialog({
  name,
  secret,
  onClose,
}: {
  name: string;
  secret: string;
  onClose: () => void;
}) {
  const t = useTranslations("settings.webhooks");
  return (
    <Dialog open={true} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("secretShownOnceTitle", { name })}</DialogTitle>
          <DialogDescription>{t("secretShownOnceDescription")}</DialogDescription>
        </DialogHeader>
        <SecretBlock value={secret} />
        <DialogFooter>
          <Button onClick={onClose}>{t("done")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SecretBlock({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const t = useTranslations("settings.webhooks");
  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-3">
        <code className="flex-1 break-all font-mono text-xs">{value}</code>
        <Button size="sm" variant="ghost" onClick={copy}>
          {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{t("secretCopyHint")}</p>
    </div>
  );
}

// --------------- Deliveries ---------------

const STATUS_FILTERS = ["all", "success", "failed", "retrying", "pending"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

function DeliveriesSheet({
  webhook,
  onClose,
}: {
  webhook: Webhook;
  onClose: () => void;
}) {
  const t = useTranslations("settings.webhooks");
  const [deliveries, setDeliveries] = useState<Delivery[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const load = async () => {
    setLoading(true);
    const r = await getWebhookDeliveries(webhook.id, 50);
    if (r.success && r.data) {
      setDeliveries(r.data);
    } else {
      setDeliveries([]);
      if (r.error) toast.error(r.error);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webhook.id]);

  const handleRetry = (id: string) =>
    startTransition(async () => {
      const r = await retryWebhookDelivery(id);
      if (r.success) {
        toast.success(t("retryQueued"));
        load();
      } else {
        toast.error(r.error || t("retryFailed"));
      }
    });

  const filtered = useMemo(() => {
    if (!deliveries) return [];
    if (filter === "all") return deliveries;
    if (filter === "retrying") {
      return deliveries.filter((d) => d.status === "retrying" || d.status === "inflight");
    }
    return deliveries.filter((d) => d.status === filter);
  }, [deliveries, filter]);

  const counts = useMemo(() => {
    const c = { all: 0, success: 0, failed: 0, retrying: 0, pending: 0 } as Record<StatusFilter, number>;
    for (const d of deliveries ?? []) {
      c.all++;
      const k = d.status === "inflight" ? "retrying" : (d.status as StatusFilter);
      if (k in c) c[k]++;
    }
    return c;
  }, [deliveries]);

  return (
    <>
      <Sheet open={true} onOpenChange={(o) => { if (!o) onClose(); }}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>{t("deliveriesTitle", { name: webhook.name })}</SheetTitle>
            <SheetDescription>{t("deliveriesDescription")}</SheetDescription>
          </SheetHeader>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Select value={filter} onValueChange={(v) => setFilter(v as StatusFilter)}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_FILTERS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {t(`filter.${s}`)} ({counts[s]})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`mr-2 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              {t("refresh")}
            </Button>
          </div>

          <div className="mt-4 space-y-2">
            {loading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}
            {!loading && filtered.length === 0 && (
              <p className="py-12 text-center text-sm text-muted-foreground">
                {filter === "all" ? t("deliveriesEmpty") : t("noMatches")}
              </p>
            )}
            {!loading &&
              filtered.map((d) => (
                <div
                  key={d.id}
                  className="rounded-md border p-3 text-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          d.status === "success"
                            ? "default"
                            : d.status === "failed"
                              ? "destructive"
                              : "secondary"
                        }
                      >
                        {d.status}
                      </Badge>
                      <code className="font-mono text-xs">{d.event}</code>
                      {d.statusCode != null && (
                        <span className="text-xs text-muted-foreground">
                          HTTP {d.statusCode}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-muted-foreground">
                        {new Date(d.createdAt).toLocaleString()}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setPreviewId(d.id)}
                        title={t("viewPayload")}
                      >
                        <Eye className="h-3 w-3" />
                      </Button>
                      {(d.status === "failed" || d.status === "retrying") && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleRetry(d.id)}
                          title={t("retry")}
                        >
                          <RefreshCw className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>{t("attempt", { n: d.attempt, max: d.maxAttempts })}</span>
                    {d.durationMs != null && <span>{d.durationMs}ms</span>}
                    {d.nextRetryAt && d.status === "retrying" && (
                      <span>
                        {t("nextRetry", {
                          when: new Date(d.nextRetryAt).toLocaleString(),
                        })}
                      </span>
                    )}
                  </div>
                  {d.errorMessage && (
                    <p className="mt-1 break-all font-mono text-xs text-red-600">
                      {d.errorMessage}
                    </p>
                  )}
                </div>
              ))}
          </div>
        </SheetContent>
      </Sheet>

      {previewId && (
        <DeliveryPayloadDialog
          deliveryId={previewId}
          onClose={() => setPreviewId(null)}
        />
      )}
    </>
  );
}

function DeliveryPayloadDialog({
  deliveryId,
  onClose,
}: {
  deliveryId: string;
  onClose: () => void;
}) {
  const t = useTranslations("settings.webhooks");
  const [data, setData] = useState<Awaited<ReturnType<typeof getDeliveryPayload>>["data"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    getDeliveryPayload(deliveryId).then((r) => {
      if (!alive) return;
      if (r.success && r.data) setData(r.data);
      else if (r.error) toast.error(r.error);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [deliveryId]);

  const formattedPayload = useMemo(() => {
    if (!data?.payload) return "";
    try {
      return JSON.stringify(JSON.parse(data.payload), null, 2);
    } catch {
      return data.payload;
    }
  }, [data]);

  const formattedResponse = useMemo(() => {
    if (!data?.responseBody) return "";
    try {
      return JSON.stringify(JSON.parse(data.responseBody), null, 2);
    } catch {
      return data.responseBody;
    }
  }, [data]);

  const copyPayload = async () => {
    if (!formattedPayload) return;
    await navigator.clipboard.writeText(formattedPayload);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    toast.success(t("payloadCopied"));
  };

  return (
    <Dialog open={true} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {data ? `${data.event} · ${data.status}` : t("loadingPayload")}
          </DialogTitle>
          <DialogDescription>
            {data
              ? t("attempt", { n: data.attempt, max: data.maxAttempts })
              : ""}
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {data && (
          <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
            <div>
              <div className="mb-1 flex items-center justify-between">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  {t("requestPayload")}
                </Label>
                <Button size="sm" variant="ghost" onClick={copyPayload}>
                  {copied ? (
                    <Check className="h-3 w-3 text-emerald-600" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </Button>
              </div>
              <pre className="overflow-x-auto rounded-md bg-muted/40 p-3 text-[11px] leading-relaxed">
                {formattedPayload}
              </pre>
            </div>

            {(data.statusCode != null || formattedResponse || data.errorMessage) && (
              <div>
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  {t("response")}
                </Label>
                <div className="mt-1 space-y-2">
                  {data.statusCode != null && (
                    <p className="text-xs font-mono text-muted-foreground">
                      HTTP {data.statusCode}
                      {data.durationMs != null ? ` · ${data.durationMs}ms` : ""}
                    </p>
                  )}
                  {data.errorMessage && (
                    <p className="break-all font-mono text-xs text-red-600">
                      {data.errorMessage}
                    </p>
                  )}
                  {formattedResponse && (
                    <pre className="overflow-x-auto rounded-md bg-muted/40 p-3 text-[11px] leading-relaxed">
                      {formattedResponse}
                    </pre>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button onClick={onClose}>{t("close")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --------------- Events Reference ---------------

function EventsReference() {
  const t = useTranslations("settings.webhooks");
  const [openIdx, setOpenIdx] = useState<number | null>(0);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const copy = async (idx: number, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 1500);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-2 p-4 text-sm">
          <h2 className="font-semibold">{t("referenceTitle")}</h2>
          <p className="text-muted-foreground">{t("referenceIntro")}</p>
          <div className="rounded-md bg-muted/40 p-3 font-mono text-[11px]">
            <p>POST &lt;your-endpoint&gt;</p>
            <p>Content-Type: application/json</p>
            <p>X-Torqvoice-Event: customer.create</p>
            <p>X-Torqvoice-Delivery: cmh3...</p>
            <p>X-Torqvoice-Attempt: 1</p>
            <p>X-Torqvoice-Signature: t=1714397253123,v1=&lt;hex&gt;</p>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {SAMPLE_PAYLOADS.map((s, i) => {
          const envelope = JSON.stringify(buildSampleEnvelope(s), null, 2);
          const open = openIdx === i;
          return (
            <Card key={s.event}>
              <CardContent className="p-0">
                <button
                  type="button"
                  onClick={() => setOpenIdx(open ? null : i)}
                  className="flex w-full items-center justify-between gap-2 p-4 text-left transition-colors hover:bg-muted/40"
                >
                  <div className="space-y-1">
                    <code className="font-mono text-xs font-semibold">{s.event}</code>
                    <p className="text-xs text-muted-foreground">{s.description}</p>
                  </div>
                  <Badge variant="outline">{open ? "−" : "+"}</Badge>
                </button>
                {open && (
                  <div className="border-t p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                        {t("samplePayload")}
                      </Label>
                      <Button size="sm" variant="ghost" onClick={() => copy(i, envelope)}>
                        {copiedIdx === i ? (
                          <Check className="h-3 w-3 text-emerald-600" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </Button>
                    </div>
                    <pre className="overflow-x-auto rounded-md bg-muted/40 p-3 text-[11px] leading-relaxed">
                      {envelope}
                    </pre>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// --------------- Help ---------------

function SignatureHelpCard() {
  const t = useTranslations("settings.webhooks");
  return (
    <Card>
      <CardContent className="space-y-3 p-4 text-sm">
        <h2 className="font-semibold">{t("helpTitle")}</h2>
        <p className="text-muted-foreground">{t("helpIntro")}</p>
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("helpHeadersTitle")}
          </p>
          <ul className="ml-4 list-disc space-y-1 font-mono text-xs">
            <li>X-Torqvoice-Event</li>
            <li>X-Torqvoice-Delivery</li>
            <li>X-Torqvoice-Attempt</li>
            <li>X-Torqvoice-Signature</li>
          </ul>
        </div>
        <p className="text-xs text-muted-foreground">{t("helpVerify")}</p>
        <pre className="overflow-x-auto rounded-md bg-muted/50 p-3 text-[11px] leading-relaxed">{`// Node.js example
import { createHmac, timingSafeEqual } from 'node:crypto'

function verify(secret, body, header) {
  const parts = Object.fromEntries(header.split(',').map(kv => kv.split('=')))
  const expected = createHmac('sha256', secret)
    .update(\`\${parts.t}.\${body}\`).digest('hex')
  return timingSafeEqual(
    Buffer.from(expected, 'hex'),
    Buffer.from(parts.v1, 'hex'),
  )
}`}</pre>
      </CardContent>
    </Card>
  );
}
