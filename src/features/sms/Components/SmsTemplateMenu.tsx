"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getSmsTemplates } from "../Actions/smsActions";

interface SmsTemplateMenuProps {
  /** Receives the template text, to drop into whatever box is being typed in */
  onPick: (body: string) => void;
  className?: string;
}

/**
 * The workshop's saved texts, offered while typing.
 *
 * Only templates that read on their own are listed: the ones built around a
 * share link or an invoice total need a job to fill them in, so offering them
 * here would only paste raw {placeholders} into the message.
 */
export function SmsTemplateMenu({ onPick, className }: SmsTemplateMenuProps) {
  const t = useTranslations("messages.compose");
  const [templates, setTemplates] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (loaded) return;
    let cancelled = false;
    (async () => {
      const result = await getSmsTemplates();
      if (cancelled) return;
      if (result.success && result.data) {
        const usable = Object.values(result.data.templates)
          .filter((body): body is string => typeof body === "string" && !!body.trim())
          .filter((body) => !body.includes("{"));
        setTemplates([...new Set(usable)]);
      }
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [loaded]);

  if (loaded && templates.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={className}
          aria-label={t("templates")}
        >
          <FileText className="mr-1.5 h-3.5 w-3.5" />
          {t("templates")}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-w-80">
        {templates.map((body) => (
          <DropdownMenuItem key={body} onClick={() => onPick(body)}>
            <span className="line-clamp-2 text-xs">{body}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
