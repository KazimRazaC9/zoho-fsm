import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";

/**
 * Runs public/sw.js against a fake browser, so its rules are tested without one:
 *  - it never serves built JavaScript (/_next/static) from its own cache (that served stale code after a
 *    rebuild: "Server Action ... was not found on the server" on login and logout);
 *  - on localhost it removes itself and every cache it left behind.
 */
const source = readFileSync(path.resolve(__dirname, "../../public/sw.js"), "utf8");

type Listener = (event: Record<string, unknown>) => void;

function boot(hostname: string, existingCaches: string[]) {
  const listeners: Record<string, Listener> = {};
  const store = new Map<string, Set<string>>(existingCaches.map((k) => [k, new Set(["/_next/static/chunks/old.js"])]));
  const client = { url: "http://x/login", navigate: vi.fn().mockResolvedValue(undefined) };
  const self = {
    location: { hostname, origin: `http://${hostname}` },
    addEventListener: (type: string, fn: Listener) => void (listeners[type] = fn),
    skipWaiting: vi.fn().mockResolvedValue(undefined),
    registration: { unregister: vi.fn().mockResolvedValue(true) },
    clients: { claim: vi.fn().mockResolvedValue(undefined), matchAll: vi.fn().mockResolvedValue([client]) },
  };
  const caches = {
    keys: async () => [...store.keys()],
    delete: async (k: string) => store.delete(k),
    open: async (k: string) => {
      if (!store.has(k)) store.set(k, new Set());
      return {
        addAll: async (urls: string[]) => urls.forEach((u) => store.get(k)!.add(u)),
        put: async () => undefined,
      };
    },
    match: async () => undefined,
  };
  vm.runInNewContext(source, { self, caches, URL, fetch: vi.fn().mockResolvedValue({ ok: false }), console });
  return { listeners, self, store, client };
}

const run = async (l: Listener | undefined, extra: Record<string, unknown> = {}) => {
  let pending: Promise<unknown> = Promise.resolve();
  l?.({ waitUntil: (p: Promise<unknown>) => void (pending = p), ...extra });
  await pending;
};

const fetchEvent = (url: string, mode = "cors") => {
  const respondWith = vi.fn();
  return { event: { request: { method: "GET", url, mode }, respondWith }, respondWith };
};

describe("service worker", () => {
  it("on localhost removes itself and every cache, then reloads open pages once", async () => {
    const sw = boot("localhost", ["fs-v1-static", "fs-v2-static"]);
    await run(sw.listeners.install);
    expect(sw.self.skipWaiting).toHaveBeenCalled();
    expect(sw.store.size).toBe(2); // nothing new is cached

    await run(sw.listeners.activate);
    expect([...sw.store.keys()]).toEqual([]);
    expect(sw.self.registration.unregister).toHaveBeenCalled();
    expect(sw.client.navigate).toHaveBeenCalledTimes(1);

    const { event, respondWith } = fetchEvent("http://localhost/_next/static/chunks/app/login/page.js");
    sw.listeners.fetch(event);
    expect(respondWith).not.toHaveBeenCalled();
  });

  it("in production drops the old version's caches (stale built code) and reloads pages once", async () => {
    const sw = boot("app.example.com", ["fs-v1-static"]);
    await run(sw.listeners.install);
    expect([...sw.store.get("fs-v2-static")!]).toEqual(["/offline.html", "/icons/icon-192.png", "/icons/icon-512.png"]);

    await run(sw.listeners.activate);
    expect([...sw.store.keys()]).toEqual(["fs-v2-static"]);
    expect(sw.self.clients.claim).toHaveBeenCalled();
    expect(sw.self.registration.unregister).not.toHaveBeenCalled();
    expect(sw.client.navigate).toHaveBeenCalledTimes(1);
  });

  it("does not reload pages when there was nothing stale to remove", async () => {
    const sw = boot("app.example.com", ["fs-v2-static"]);
    await run(sw.listeners.activate);
    expect(sw.client.navigate).not.toHaveBeenCalled();
  });

  it("never serves built JavaScript from its cache, but still handles pages and icons", () => {
    const sw = boot("app.example.com", []);
    const chunk = fetchEvent("http://app.example.com/_next/static/chunks/app/login/page.js");
    sw.listeners.fetch(chunk.event);
    expect(chunk.respondWith).not.toHaveBeenCalled();

    const page = fetchEvent("http://app.example.com/my-jobs", "navigate");
    sw.listeners.fetch(page.event);
    expect(page.respondWith).toHaveBeenCalled();

    const icon = fetchEvent("http://app.example.com/icons/icon-192.png");
    sw.listeners.fetch(icon.event);
    expect(icon.respondWith).toHaveBeenCalled();
  });
});
