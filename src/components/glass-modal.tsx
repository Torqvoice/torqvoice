"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { create } from "zustand";

type ModalType = "error" | "success" | "info" | "warning";

interface ModalState {
  isOpen: boolean;
  type: ModalType;
  title: string;
  message: string;
  open: (type: ModalType, title: string, message: string) => void;
  close: () => void;
}

export const useGlassModal = create<ModalState>((set) => ({
  isOpen: false,
  type: "info",
  title: "",
  message: "",
  open: (type, title, message) => set({ isOpen: true, type, title, message }),
  close: () => set({ isOpen: false }),
}));

const icons: Record<ModalType, React.ReactNode> = {
  error: <XCircle className="h-6 w-6 text-red-500" />,
  success: <CheckCircle2 className="h-6 w-6 text-emerald-500" />,
  info: <Info className="h-6 w-6 text-blue-500" />,
  warning: <AlertTriangle className="h-6 w-6 text-amber-500" />,
};

export function GlassModal() {
  const { isOpen, type, title, message, close } = useGlassModal();

  return (
    <Dialog open={isOpen} onOpenChange={close}>
      <DialogContent className="glass border-0 shadow-2xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            {icons[type]}
            <DialogTitle className="text-lg">{title}</DialogTitle>
          </div>
          <DialogDescription className="mt-2 text-sm leading-relaxed">
            {message}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={close} variant="outline" className="w-full sm:w-auto">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
