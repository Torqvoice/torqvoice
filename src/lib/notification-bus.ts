import { EventEmitter } from "node:events";

const globalForBus = globalThis as unknown as {
  notificationBus: EventEmitter | undefined;
};

export const notificationBus =
  globalForBus.notificationBus ?? new EventEmitter();

// Survive HMR in dev
globalForBus.notificationBus = notificationBus;
