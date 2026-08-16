"use client";

import { useCallback, useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useTranslations } from "next-intl";

export interface LightboxImage {
  url: string;
  caption: string;
}

const FOCUSABLE = 'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

/**
 * Full-screen image viewer.
 *
 * Built as a real modal dialog rather than a bare overlay: it takes focus on
 * open, keeps Tab inside itself while it is open, restores focus to whatever
 * opened it on close, and closes on Escape (WCAG 2.1 SC 2.1.2 and 2.4.3). The
 * previous viewer trapped nothing and left keyboard users stranded behind it.
 */
export function MediaLightbox({
  images,
  index,
  onClose,
  onNavigate,
}: {
  images: LightboxImage[];
  /** Index into `images`, or null when the viewer is closed. */
  index: number | null;
  onClose: () => void;
  onNavigate: (index: number) => void;
}) {
  const t = useTranslations("inspections.media");
  const containerRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const touchStartX = useRef<number | null>(null);

  const isOpen = index !== null && !!images[index];

  const goPrev = useCallback(() => {
    if (index !== null && index > 0) onNavigate(index - 1);
  }, [index, onNavigate]);

  const goNext = useCallback(() => {
    if (index !== null && index < images.length - 1) onNavigate(index + 1);
  }, [index, images.length, onNavigate]);

  // Remember what had focus, move focus into the dialog, and hand it back on close.
  useEffect(() => {
    if (!isOpen) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    containerRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    return () => previouslyFocused.current?.focus?.();
  }, [isOpen]);

  // The page behind must not scroll while the viewer covers it.
  useEffect(() => {
    if (!isOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === "ArrowLeft") {
        goPrev();
        return;
      }
      if (event.key === "ArrowRight") {
        goNext();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = Array.from(
        containerRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose, goPrev, goNext]);

  if (index === null) return null;
  const image = images[index];
  if (!image) return null;

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(delta) > 50) {
      if (delta > 0) goPrev();
      else goNext();
    }
    touchStartX.current = null;
  };

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label={t("viewer", { index: index + 1, total: images.length, caption: image.caption })}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label={t("close")}
        className="absolute top-3 right-3 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none sm:top-4 sm:right-4"
      >
        <X className="h-5 w-5" aria-hidden="true" />
      </button>

      {images.length > 1 && (
        <p className="absolute top-4 left-1/2 z-10 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1 text-sm font-medium text-white">
          {index + 1} / {images.length}
        </p>
      )}

      {index > 0 && (
        <button
          type="button"
          onClick={goPrev}
          aria-label={t("previous")}
          className="absolute left-2 z-10 flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none sm:left-4"
        >
          <ChevronLeft className="h-6 w-6" aria-hidden="true" />
        </button>
      )}

      {index < images.length - 1 && (
        <button
          type="button"
          onClick={goNext}
          aria-label={t("next")}
          className="absolute right-2 z-10 flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none sm:right-4"
        >
          <ChevronRight className="h-6 w-6" aria-hidden="true" />
        </button>
      )}

      <figure className="flex max-h-full max-w-5xl flex-col items-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image.url}
          alt={image.caption}
          className="max-h-[80vh] max-w-full rounded-lg object-contain"
          draggable={false}
        />
        <figcaption className="mt-3 max-w-md text-center text-sm text-white/80">
          {image.caption}
        </figcaption>
      </figure>
    </div>
  );
}
