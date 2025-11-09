import * as winston from "winston";
export type MemoryEntry = Record<string, unknown>;
import { randomBytes } from "node:crypto";

import { AsyncLocalStorage } from "node:async_hooks";
const topLevelMemoryObj: Record<string, MemoryEntry> = {};
const ctxStore = new AsyncLocalStorage<string>();

export async function withCtx(fn: () => Promise<any>): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const ctxId = randomBytes(8).toString("hex");
    topLevelMemoryObj[ctxId] = {};
    ctxStore.run(ctxId, () => {
      fn()
        .then(() => resolve())
        .catch(reject)
        .finally(() => {
          delete topLevelMemoryObj[ctxId];
        });
    });
  });
}

export function getCtxId(): string {
  const ctxId = ctxStore.getStore();
  if (!ctxId) {
    throw new Error("No context initialized");
  }
  return ctxId;
}

export function getCtx(): MemoryEntry {
  const ctxId = ctxStore.getStore();
  if (!ctxId) {
    throw new Error("No context initialized");
  }
  return topLevelMemoryObj[ctxId] as MemoryEntry;
}

export function setCtx(fn: (ctx: MemoryEntry) => MemoryEntry): void {
  const ctxId = ctxStore.getStore();
  if (!ctxId) {
    throw new Error("No context initialized");
  }
  const ctx = topLevelMemoryObj[ctxId] as MemoryEntry;

  topLevelMemoryObj[ctxId] = fn(ctx);
}

export function getAllCtx(): Record<string, MemoryEntry> {
  return topLevelMemoryObj;
}

export const logger = winston.createLogger({
  level: "debug",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  /*
    name: string;
    ssl: boolean;
    host: string;
    maximumDepth: number;
    port: number;
    auth?: {
      username?: string | undefined;
      password?: string | undefined;
      bearer?: string | undefined;
    };
    path: string;
    agent?: Agent | null;
  */
  transports: [
    new winston.transports.File({ filename: "chat.log" }),
    new winston.transports.Http({
      host: "localhost",
      ssl: false,
      maximumDepth: 100,
      port: 5080,
      auth: {
        username: process.env.OPEN_OBSERVE_USERNAME,
        password: process.env.OPEN_OBSERVE_PASSWORD,
      },
      path: "/api/default/logs/_json",
    }),
  ],
});
