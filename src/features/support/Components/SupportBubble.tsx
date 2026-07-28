"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Camera,
  ChevronLeft,
  GripVertical,
  Headset,
  Loader2,
  Paperclip,
  Send,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { compressImage } from "@/lib/compress-image";
import {
  ATTACHMENT_ACCEPT,
  MAX_ATTACHMENTS,
  MAX_MESSAGE_LENGTH,
  MAX_SUBJECT_LENGTH,
  MAX_TOTAL_ATTACHMENT_BYTES,
} from "@/features/support/Lib/supportRequest";
import {
  SUPPORT_OPEN_EVENT,
  SUPPORT_VISIBILITY_EVENT,
  isSupportBubbleHidden,
  setSupportBubbleHidden,
} from "@/features/support/Lib/supportVisibility";
import { useDraggablePosition } from "@/features/support/Lib/useDraggablePosition";

type Status = "idle" | "sending" | "sent";

const TRIGGER_SIZE = 48;
const PANEL_WIDTH = 380;
const GAP = 12;

/**
 * Error codes the endpoint can return that have their own copy. Anything
 * outside this list falls back to the generic message: next-intl throws on a
 * missing key, so an unrecognised code must never reach `t()` directly.
 */
const KNOWN_ERROR_CODES = [
  "subject-required",
  "subject-too-long",
  "message-required",
  "message-too-long",
  "too-many-attachments",
  "attachment-type-not-allowed",
  "attachments-too-large",
] as const;

function errorKey(code: unknown): string {
  return (KNOWN_ERROR_CODES as readonly string[]).includes(String(code))
    ? `errors.${code}`
    : "errors.sendFailed";
}

export function SupportBubble() {
  const t = useTranslations("support");
  const [isOpen, setIsOpen] = useState(false);
  // Assume hidden until localStorage has been read. Rendering the button and
  // then pulling it away is worse than a frame without it.
  const [hidden, setHidden] = useState(true);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [capturing, setCapturing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { position, dragging, consumeDrag, dragHandlers } = useDraggablePosition(TRIGGER_SIZE);

  useEffect(() => {
    const sync = () => setHidden(isSupportBubbleHidden());
    sync();
    // The settings page toggles the same key. `storage` covers other tabs; the
    // custom event covers this one, which `storage` does not fire for.
    window.addEventListener("storage", sync);
    window.addEventListener(SUPPORT_VISIBILITY_EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(SUPPORT_VISIBILITY_EVENT, sync);
    };
  }, []);

  // The settings page opens the widget for someone who cannot find it.
  useEffect(() => {
    const open = () => setIsOpen(true);
    window.addEventListener(SUPPORT_OPEN_EVENT, open);
    return () => window.removeEventListener(SUPPORT_OPEN_EVENT, open);
  }, []);

  /**
   * The panel follows the button. It is right-aligned to the button and opens
   * upward when the button sits low, which is where it usually will after being
   * dragged clear of a save button.
   */
  const panelStyle = useMemo((): React.CSSProperties | undefined => {
    if (!position || typeof window === "undefined") return undefined;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const width = Math.min(PANEL_WIDTH, viewportWidth - 2 * GAP);
    const left = Math.max(
      GAP,
      Math.min(position.x + TRIGGER_SIZE - width, viewportWidth - width - GAP),
    );

    return position.y > viewportHeight / 2
      ? { left, bottom: viewportHeight - position.y + GAP, width }
      : { left, top: position.y + TRIGGER_SIZE + GAP, width };
  }, [position]);

  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);

  const reset = useCallback(() => {
    setSubject("");
    setMessage("");
    setFiles([]);
    setError(null);
    setStatus("idle");
  }, []);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    if (status !== "sent") setError(null);
  }, [status]);

  const handleDismiss = useCallback(() => {
    setSupportBubbleHidden(true);
    setIsOpen(false);
  }, []);

  const addFiles = useCallback(
    async (incoming: File[]) => {
      setError(null);
      const room = MAX_ATTACHMENTS - files.length;
      if (room <= 0) {
        setError(t("errors.too-many-attachments", { max: MAX_ATTACHMENTS }));
        return;
      }

      // Images are shrunk before they are counted, so a phone photo does not
      // eat the whole budget on its own.
      const processed = await Promise.all(
        incoming.slice(0, room).map((file) =>
          file.type.startsWith("image/") ? compressImage(file) : Promise.resolve(file),
        ),
      );

      const next = [...files, ...processed];
      if (next.reduce((sum, f) => sum + f.size, 0) > MAX_TOTAL_ATTACHMENT_BYTES) {
        setError(t("errors.attachments-too-large"));
        return;
      }
      setFiles(next);
    },
    [files, t],
  );

  const handleScreenshot = useCallback(async () => {
    setCapturing(true);
    setError(null);
    // Close the panel so the capture shows the page the user is reporting on,
    // not the form covering it.
    setIsOpen(false);
    try {
      // Loaded on demand: this is a large dependency and most sessions never
      // open the widget, let alone take a screenshot.
      const { snapdom } = await import("@zumer/snapdom");
      // Two frames, so the panel has actually left the screen before capture.
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const blob = await snapdom.toBlob(document.body, {
        type: "jpeg",
        quality: 0.7,
        backgroundColor: "#ffffff",
      });
      const file = new File([blob], `screenshot-${Date.now()}.jpg`, { type: "image/jpeg" });
      await addFiles([file]);
    } catch {
      setError(t("errors.screenshotFailed"));
    } finally {
      setCapturing(false);
      setIsOpen(true);
    }
  }, [addFiles, t]);

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      setStatus("sending");
      setError(null);

      const body = new FormData();
      body.set("subject", subject);
      body.set("message", message);
      body.set("pageUrl", window.location.href);
      for (const file of files) body.append("files", file);

      try {
        const response = await fetch("/api/protected/support", { method: "POST", body });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          setError(t(errorKey(payload.error), { max: MAX_ATTACHMENTS }));
          setStatus("idle");
          return;
        }
        setStatus("sent");
        setSubject("");
        setMessage("");
        setFiles([]);
      } catch {
        setError(t("errors.sendFailed"));
        setStatus("idle");
      }
    },
    [subject, message, files, t],
  );

  // position is null until localStorage and the viewport have been read.
  if (!position) return null;

  // Dismissed collapses to a tab tucked against the right edge rather than
  // disappearing. Removing the button outright leaves no way back except the
  // settings page, which is not somewhere you look when you want support.
  if (hidden) {
    return (
      <button
        type="button"
        onClick={() => {
          setSupportBubbleHidden(false);
          setIsOpen(true);
        }}
        className="group fixed right-0 bottom-24 z-50 flex h-9 items-center gap-0 rounded-l-md border border-r-0 border-border/60 bg-background/80 pl-1.5 pr-1 text-muted-foreground/60 shadow-sm backdrop-blur transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:bottom-8"
        aria-label={t("restore")}
      >
        <ChevronLeft className="h-3.5 w-3.5 shrink-0" />
        {/* Collapsed to an arrow until pointed at, so it stays out of the way
            but still says what it does rather than relying on a tooltip. */}
        <span className="max-w-0 overflow-hidden whitespace-nowrap text-xs font-medium opacity-0 transition-all duration-200 group-hover:max-w-[12rem] group-hover:pr-1 group-hover:opacity-100 group-focus-visible:max-w-[12rem] group-focus-visible:pr-1 group-focus-visible:opacity-100">
          {t("restore")}
        </span>
      </button>
    );
  }

  return (
    <>
      {!isOpen && (
        <button
          type="button"
          {...dragHandlers}
          onClick={() => {
            // Swallow the click that ends a drag, so moving the button out of
            // the way does not also open the form.
            if (consumeDrag()) return;
            setIsOpen(true);
          }}
          style={{ left: position.x, top: position.y, width: TRIGGER_SIZE, height: TRIGGER_SIZE }}
          className={`fixed z-50 flex touch-none items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/25 ring-1 ring-inset ring-white/15 transition-[box-shadow,transform] hover:shadow-xl hover:shadow-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
            dragging ? "scale-105 cursor-grabbing" : "cursor-grab hover:-translate-y-0.5"
          }`}
          aria-label={t("open")}
          title={t("dragHint")}
        >
          <Headset className="h-[22px] w-[22px]" strokeWidth={1.75} />
        </button>
      )}

      {isOpen && (
        <div
          style={panelStyle}
          className="fixed z-50 overflow-hidden rounded-xl border bg-popover shadow-2xl ring-1 ring-black/5 dark:ring-white/10"
        >
          <div className="flex items-center gap-1 border-b bg-muted/40 py-2 pl-1 pr-2">
            {/* Hidden from assistive tech rather than announced as a button.
                Dragging is pointer-only, so exposing it as a control would
                advertise something a keyboard user cannot operate. Nothing is
                lost: every control in the panel is reachable regardless of
                where it sits, and the position is only a convenience. */}
            <span
              {...dragHandlers}
              aria-hidden="true"
              title={t("move")}
              className={`flex h-7 w-6 shrink-0 touch-none items-center justify-center text-muted-foreground/60 hover:text-muted-foreground ${
                dragging ? "cursor-grabbing" : "cursor-grab"
              }`}
            >
              <GripVertical className="h-4 w-4" />
            </span>
            <Headset className="h-4 w-4 shrink-0 text-primary" strokeWidth={1.75} />
            <span className="flex-1 truncate text-sm font-medium">{t("title")}</span>
            <button
              type="button"
              onClick={handleClose}
              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label={t("close")}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="max-h-[min(70vh,32rem)] overflow-y-auto p-4">
            {status === "sent" ? (
              <div className="py-6 text-center">
                <p className="font-medium">{t("sentTitle")}</p>
                <p className="mt-1 text-sm text-muted-foreground">{t("sentDescription")}</p>
                <div className="mt-4 flex justify-center gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={reset}>
                    {t("sendAnother")}
                  </Button>
                  <Button type="button" size="sm" onClick={handleClose}>
                    {t("close")}
                  </Button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="support-subject" className="text-xs text-muted-foreground">
                    {t("subjectLabel")}
                  </Label>
                  <Input
                    id="support-subject"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    maxLength={MAX_SUBJECT_LENGTH}
                    required
                    placeholder={t("subjectPlaceholder")}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="support-message" className="text-xs text-muted-foreground">
                    {t("messageLabel")}
                  </Label>
                  <Textarea
                    id="support-message"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    maxLength={MAX_MESSAGE_LENGTH}
                    required
                    rows={4}
                    className="resize-none"
                    placeholder={t("messagePlaceholder")}
                  />
                </div>

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={handleScreenshot}
                    disabled={capturing || files.length >= MAX_ATTACHMENTS}
                  >
                    {capturing ? (
                      <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    ) : (
                      <Camera className="mr-1 h-4 w-4" />
                    )}
                    {t("takeScreenshot")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={files.length >= MAX_ATTACHMENTS}
                  >
                    <Paperclip className="mr-1 h-4 w-4" />
                    {t("addFiles")}
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept={ATTACHMENT_ACCEPT}
                    className="hidden"
                    onChange={(e) => {
                      void addFiles(Array.from(e.target.files ?? []));
                      e.target.value = "";
                    }}
                  />
                </div>

                {files.length > 0 && (
                  <ul className="space-y-1">
                    {files.map((file, index) => (
                      <li
                        key={`${file.name}-${index}`}
                        className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-2 py-1 text-xs"
                      >
                        <span className="truncate" title={file.name}>
                          {file.name}
                        </span>
                        <button
                          type="button"
                          className="shrink-0 text-muted-foreground hover:text-destructive"
                          onClick={() => setFiles(files.filter((_, i) => i !== index))}
                          aria-label={t("removeAttachment")}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    ))}
                    <li className="px-0.5 pt-0.5 text-[11px] text-muted-foreground">
                      {t("attachmentSummary", {
                        count: files.length,
                        max: MAX_ATTACHMENTS,
                        size: (totalBytes / (1024 * 1024)).toFixed(1),
                      })}
                    </li>
                  </ul>
                )}

                {error && <p className="text-sm text-destructive">{error}</p>}

                <Button type="submit" className="w-full" disabled={status === "sending"}>
                  {status === "sending" ? (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="mr-1 h-4 w-4" />
                  )}
                  {status === "sending" ? t("sending") : t("send")}
                </Button>

                <button
                  type="button"
                  onClick={handleDismiss}
                  className="w-full text-center text-xs text-muted-foreground transition-colors hover:text-foreground hover:underline"
                >
                  {t("hideButton")}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
