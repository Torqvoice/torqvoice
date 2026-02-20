import { create } from "zustand";

export type Notification = {
  id: string;
  type: string;
  title: string;
  message: string;
  entityType: string;
  entityId: string;
  entityUrl: string;
  read: boolean;
  organizationId: string;
  createdAt: string | Date;
};

type NotificationState = {
  notifications: Notification[];
  unreadCount: number;
  isConnected: boolean;
  isPanelOpen: boolean;
  setNotifications: (notifications: Notification[], unreadCount: number) => void;
  addNotification: (notification: Notification) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  removeNotification: (id: string) => void;
  setConnected: (connected: boolean) => void;
  setPanelOpen: (open: boolean) => void;
};

export const useNotificationStore = create<NotificationState>((set) => ({
  notifications: [],
  unreadCount: 0,
  isConnected: false,
  isPanelOpen: false,
  setNotifications: (notifications, unreadCount) => set({ notifications, unreadCount }),
  addNotification: (notification) =>
    set((state) => ({
      notifications: [notification, ...state.notifications].slice(0, 50),
      unreadCount: state.unreadCount + 1,
    })),
  markRead: (id) =>
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n,
      ),
      unreadCount: Math.max(0, state.unreadCount - (state.notifications.find((n) => n.id === id && !n.read) ? 1 : 0)),
    })),
  markAllRead: () =>
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    })),
  removeNotification: (id) =>
    set((state) => {
      const target = state.notifications.find((n) => n.id === id);
      return {
        notifications: state.notifications.filter((n) => n.id !== id),
        unreadCount: Math.max(0, state.unreadCount - (target && !target.read ? 1 : 0)),
      };
    }),
  setConnected: (isConnected) => set({ isConnected }),
  setPanelOpen: (isPanelOpen) => set({ isPanelOpen }),
}));
