"use client";

import { useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, X as XIcon } from "lucide-react";
import type { Attachment } from "./types";

interface ImageCarouselProps {
  images: Attachment[];
  currentIndex: number | null;
  onClose: () => void;
  onChangeIndex: (index: number) => void;
}

export function ImageCarousel({ images, currentIndex, onClose, onChangeIndex }: ImageCarouselProps) {
  const touchStartX = useRef<number | null>(null);

  const prev = () => {
    if (currentIndex !== null && currentIndex > 0) onChangeIndex(currentIndex - 1);
  };
  const next = () => {
    if (currentIndex !== null && currentIndex < images.length - 1) onChangeIndex(currentIndex + 1);
  };

  useEffect(() => {
    if (currentIndex === null) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [currentIndex, images.length]);

  if (currentIndex === null || !images[currentIndex]) return null;

  const image = images[currentIndex];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
      onClick={onClose}
      onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        if (touchStartX.current === null) return;
        const diff = e.changedTouches[0].clientX - touchStartX.current;
        if (Math.abs(diff) > 50) { diff > 0 ? prev() : next(); }
        touchStartX.current = null;
      }}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-3 right-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70 sm:top-4 sm:right-4"
      >
        <XIcon className="h-5 w-5" />
      </button>

      {images.length > 1 && (
        <div className="absolute top-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-sm font-medium text-white sm:top-4">
          {currentIndex + 1} / {images.length}
        </div>
      )}

      {currentIndex > 0 && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); prev(); }}
          className="absolute left-2 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70 sm:left-4 sm:h-12 sm:w-12"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
      )}

      {currentIndex < images.length - 1 && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); next(); }}
          className="absolute right-2 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70 sm:right-4 sm:h-12 sm:w-12"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      )}

      <div className="flex max-h-[85vh] max-w-[90vw] flex-col items-center" onClick={(e) => e.stopPropagation()}>
        <img
          src={image.fileUrl}
          alt={image.description || image.fileName}
          className="max-h-[80vh] max-w-full rounded-lg object-contain"
          draggable={false}
        />
        {image.description && (
          <p className="mt-2 max-w-md text-center text-sm text-white/80">{image.description}</p>
        )}
      </div>
    </div>
  );
}
