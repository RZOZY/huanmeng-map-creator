import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const source = readFileSync(new URL("../../../public/libs/indexedDB.js", import.meta.url), "utf8");
type Method = "get" | "set";
type Handler = (event: { target: ControlledRequest | ControlledTransaction | ControlledDatabase }) => void;
type Outcome = { status: "pending" } | { status: "fulfilled"; value: unknown } | { status: "rejected"; error: unknown };

class ControlledRequest {
  result?: unknown;
  error: Error | null = null;
  transaction?: ControlledTransaction;
  onsuccess?: Handler;
  onerror?: Handler;
  onupgradeneeded?: Handler;
  onblocked?: Handler;

  succeed(result: unknown) {
    this.result = result;
    this.onsuccess?.({ target: this });
  }

  fail(error: Error | null) {
    this.error = error;
    this.onerror?.({ target: this });
  }

  upgrade(database: ControlledDatabase) {
    this.result = database;
    this.transaction = database.upgradeTransaction;
    this.onupgradeneeded?.({ target: this });
  }
}

class ControlledStore {
  transaction!: ControlledTransaction;
  getRequest = new ControlledRequest();
  putRequest = new ControlledRequest();
  get = vi.fn((_key: string) => this.getRequest);
  put = vi.fn((_record: { key: string; value: unknown }) => this.putRequest);
}

class ControlledTransaction {
  error: Error | null = null;
  oncomplete?: Handler;
  onerror?: Handler;
  onabort?: Handler;
  store = new ControlledStore();
  objectStore = vi.fn((_name: string | string[]) => this.store);
  abort = vi.fn(() => this.cancel());

  constructor() {
    this.store.transaction = this;
  }

  complete() {
    this.oncomplete?.({ target: this });
  }

  fail(error: Error | null) {
    this.error = error;
    this.onerror?.({ target: this });
  }

  cancel(error: Error | null = null) {
    this.error = error;
    this.onabort?.({ target: this });
  }
}

class ControlledDatabase {
  objectStoreNames = ["s"];
  onversionchange?: Handler;
  onclose?: Handler;
  upgradeTransaction = new ControlledTransaction();
  transactions: ControlledTransaction[] = [];
  transaction = vi.fn((_name: string, _mode: string) => {
    const transaction = new ControlledTransaction();
    this.transactions.push(transaction);
    return transaction;
  });
  createObjectStore = vi.fn((_name: string, _options: { keyPath: string }) => this.upgradeTransaction.store);
  close = vi.fn();
}

function observe(promise: Promise<unknown>) {
  let outcome: Outcome = { status: "pending" };
  void promise.then(
    value => {
      outcome = { status: "fulfilled", value };
    },
    error => {
      outcome = { status: "rejected", error };
    }
  );
  return () => outcome;
}

async function flush() {
  for (let turn = 0; turn < 8; turn++) await Promise.resolve();
}

function createHarness(supported = true) {
  const requests: ControlledRequest[] = [];
  const open = vi.fn((_name: string) => {
    const request = new ControlledRequest();
    requests.push(request);
    return request;
  });
  const context = createContext({
    window: { indexedDB: supported ? { open } : undefined },
    console: { error: vi.fn() }
  });
  const ldb = runInContext(`${source}\nldb;`, context) as {
    get: (key: string) => Promise<unknown>;
    set: (key: string, value: unknown) => Promise<void>;
  };
  const database = new ControlledDatabase();
  const start = (method: Method) => observe(method === "get" ? ldb.get("map") : ldb.set("map", "saved map"));
  return { ldb, open, requests, database, start };
}

async function begin(method: Method) {
  const harness = createHarness();
  const outcome = harness.start(method);
  harness.requests[0].succeed(harness.database);
  await flush();
  const transaction = harness.database.transactions[0];
  const request = method === "get" ? transaction.store.getRequest : transaction.store.putRequest;
  return { ...harness, outcome, transaction, request };
}

function succeedTransaction(transaction: ControlledTransaction, method: Method) {
  const request = method === "get" ? transaction.store.getRequest : transaction.store.putRequest;
  request.succeed(method === "get" ? { key: "map", value: "saved map" } : "map");
  transaction.complete();
}

function expectFailure(outcome: Outcome, error: Error) {
  expect(outcome.status).toBe("rejected");
  if (outcome.status === "rejected") expect(outcome.error).toBe(error);
}

function expectReadableFailure(outcome: Outcome, message: RegExp) {
  expect(outcome.status).toBe("rejected");
  if (outcome.status === "rejected") expect(outcome.error).toMatchObject({ message: expect.stringMatching(message) });
}

const methods: Method[] = ["get", "set"];

describe("classic IndexedDB persistence", () => {
  it("set waits for transaction completion rather than put success and preserves the storage format", async () => {
    const { open, database, transaction, request, outcome } = await begin("set");
    expect(open).toHaveBeenCalledExactlyOnceWith("d2");
    expect(database.transaction).toHaveBeenCalledExactlyOnceWith("s", "readwrite");
    expect(transaction.store.put).toHaveBeenCalledExactlyOnceWith({ key: "map", value: "saved map" });
    request.succeed("map");
    await flush();
    expect(outcome()).toEqual({ status: "pending" });
    transaction.complete();
    await flush();
    expect(outcome()).toEqual({ status: "fulfilled", value: undefined });
    expect(transaction.objectStore).toHaveBeenCalledExactlyOnceWith("s");
  });

  it.each([
    { name: "zero", record: { value: 0 }, expected: 0 },
    { name: "false", record: { value: false }, expected: false },
    { name: "empty string", record: { value: "" }, expected: "" },
    { name: "null", record: { value: null }, expected: null },
    { name: "undefined value", record: { value: undefined }, expected: null },
    { name: "missing record", record: undefined, expected: null },
    { name: "object", record: { value: { map: "data" } }, expected: { map: "data" } }
  ])("get preserves $name with null for missing data", async ({ record, expected }) => {
    const { database, transaction, request, outcome } = await begin("get");
    expect(database.transaction).toHaveBeenCalledExactlyOnceWith("s", "readonly");
    expect(transaction.store.get).toHaveBeenCalledExactlyOnceWith("map");
    request.succeed(record);
    transaction.complete();
    await flush();
    expect(outcome()).toEqual({ status: "fulfilled", value: expected });
  });

  it.each(methods)(
    "%s rejects an abort after request success instead of reporting a committed operation",
    async method => {
      const { transaction, request, outcome } = await begin(method);
      const error = new Error("commit failed after request success");
      request.succeed({ value: "not committed" });
      await flush();
      expect(outcome()).toEqual({ status: "pending" });
      transaction.cancel(error);
      await flush();
      expectFailure(outcome(), error);
    }
  );

  it("reuses an opened connection without issuing another open request", async () => {
    const harness = await begin("get");
    succeedTransaction(harness.transaction, "get");
    await flush();
    const second = harness.start("set");
    await flush();
    expect(harness.open).toHaveBeenCalledTimes(1);
    succeedTransaction(harness.database.transactions[1], "set");
    await flush();
    expect(second()).toEqual({ status: "fulfilled", value: undefined });
  });

  it("shares an in-flight open and does not expose the upgrade connection before open success", async () => {
    const harness = createHarness();
    const first = harness.start("set");
    harness.requests[0].upgrade(harness.database);
    const second = harness.start("get");
    await flush();
    expect(harness.database.createObjectStore).toHaveBeenCalledExactlyOnceWith("s", { keyPath: "key" });
    expect(harness.open).toHaveBeenCalledTimes(1);
    expect(harness.database.transaction).not.toHaveBeenCalled();
    harness.database.upgradeTransaction.complete();
    await flush();
    expect(harness.database.transaction).not.toHaveBeenCalled();
    harness.requests[0].succeed(harness.database);
    await flush();
    succeedTransaction(harness.database.transactions[0], "set");
    succeedTransaction(harness.database.transactions[1], "get");
    await flush();
    expect(first()).toEqual({ status: "fulfilled", value: undefined });
    expect(second()).toEqual({ status: "fulfilled", value: "saved map" });
  });

  it.each(methods)("%s propagates unsupported IndexedDB without pending", async method => {
    const harness = createHarness(false);
    const outcome = harness.start(method);
    await flush();
    expectReadableFailure(outcome(), /not supported/i);
  });

  it.each(methods)("%s propagates open errors unchanged and permits a retry", async method => {
    const harness = createHarness();
    const error = new Error("permission denied while opening");
    const outcome = harness.start(method);
    harness.requests[0].fail(error);
    await flush();
    expectFailure(outcome(), error);
    const retry = harness.start(method);
    expect(harness.open).toHaveBeenCalledTimes(2);
    harness.requests[1].succeed(harness.database);
    await flush();
    succeedTransaction(harness.database.transactions[0], method);
    await flush();
    expect(retry().status).toBe("fulfilled");
  });

  it("rejects every waiter on an open failure with the original error", async () => {
    const harness = createHarness();
    const error = new Error("shared open failed");
    const first = harness.start("get");
    const second = harness.start("set");
    expect(harness.open).toHaveBeenCalledTimes(1);
    harness.requests[0].fail(error);
    await flush();
    expectFailure(first(), error);
    expectFailure(second(), error);
  });

  it.each(methods)("%s provides a readable open error when IndexedDB supplies none", async method => {
    const harness = createHarness();
    const outcome = harness.start(method);
    harness.requests[0].fail(null);
    await flush();
    expectReadableFailure(outcome(), /open.*fail/i);
  });

  it.each(methods)("%s propagates synchronous open throws unchanged", async method => {
    const harness = createHarness();
    const error = new Error("synchronous open security error");
    harness.open.mockImplementationOnce(() => {
      throw error;
    });
    const outcome = harness.start(method);
    await flush();
    expectFailure(outcome(), error);
  });

  it.each(methods)("%s rejects a blocked open and closes a late successful connection", async method => {
    const harness = createHarness();
    const outcome = harness.start(method);
    harness.requests[0].onblocked?.({ target: harness.requests[0] });
    await flush();
    expectReadableFailure(outcome(), /blocked/i);
    harness.requests[0].succeed(harness.database);
    expect(harness.database.close).toHaveBeenCalledOnce();
    const retry = harness.start(method);
    expect(harness.open).toHaveBeenCalledTimes(2);
    const database = new ControlledDatabase();
    harness.requests[1].succeed(database);
    await flush();
    succeedTransaction(database.transactions[0], method);
    await flush();
    expect(retry().status).toBe("fulfilled");
  });

  it.each(methods)("%s propagates upgrade creation throws and aborts the upgrade", async method => {
    const harness = createHarness();
    const error = new Error("cannot create store");
    harness.database.createObjectStore.mockImplementationOnce(() => {
      throw error;
    });
    const outcome = harness.start(method);
    harness.requests[0].upgrade(harness.database);
    await flush();
    expectFailure(outcome(), error);
    expect(harness.database.upgradeTransaction.abort).toHaveBeenCalledOnce();
    expect(harness.database.transaction).not.toHaveBeenCalled();
  });

  it.each(["error", "abort"] as const)("rejects an upgrade %s without caching the failed database", async event => {
    const harness = createHarness();
    const error = new Error(`upgrade ${event}`);
    const outcome = harness.start("set");
    harness.requests[0].upgrade(harness.database);
    if (event === "error") harness.database.upgradeTransaction.fail(error);
    else harness.database.upgradeTransaction.cancel(error);
    await flush();
    expectFailure(outcome(), error);
    const retry = harness.start("get");
    expect(harness.open).toHaveBeenCalledTimes(2);
    const database = new ControlledDatabase();
    harness.requests[1].succeed(database);
    await flush();
    succeedTransaction(database.transactions[0], "get");
    await flush();
    expect(retry()).toEqual({ status: "fulfilled", value: "saved map" });
  });

  describe.each(methods)("%s failures", method => {
    it.each(["request", "transaction", "abort"] as const)(
      "rejects %s errors unchanged without waiting forever",
      async event => {
        const { transaction, request, outcome } = await begin(method);
        const error = new Error(`original ${method} ${event} failure`);
        if (event === "request") request.fail(error);
        else if (event === "transaction") transaction.fail(error);
        else transaction.cancel(error);
        await flush();
        expectFailure(outcome(), error);
      }
    );

    it.each(["error", "abort"] as const)(
      "provides a readable fallback for an %s without an original error",
      async event => {
        const { transaction, outcome } = await begin(method);
        if (event === "error") transaction.fail(null);
        else transaction.cancel();
        await flush();
        expectReadableFailure(outcome(), event === "error" ? /transaction.*fail/i : /abort/i);
      }
    );

    it("provides a readable request error when IndexedDB supplies none", async () => {
      const { request, outcome } = await begin(method);
      request.fail(null);
      await flush();
      expectReadableFailure(outcome(), /request.*fail/i);
    });

    it("preserves a bubbling request error when transaction.error is still null", async () => {
      const { transaction, request, outcome } = await begin(method);
      const error = new Error("bubbled request failure");
      request.error = error;
      transaction.onerror?.({ target: request });
      await flush();
      expectFailure(outcome(), error);
    });

    it.each(["transaction", "objectStore", "request"] as const)(
      "propagates a synchronous %s throw unchanged",
      async stage => {
        const harness = createHarness();
        const error = new Error(`synchronous ${stage} failure`);
        harness.database.transaction.mockImplementationOnce(() => {
          if (stage === "transaction") throw error;
          const transaction = new ControlledTransaction();
          if (stage === "objectStore") {
            transaction.objectStore.mockImplementationOnce(() => {
              throw error;
            });
          } else {
            const createRequest = method === "get" ? transaction.store.get : transaction.store.put;
            createRequest.mockImplementationOnce(() => {
              throw error;
            });
          }
          return transaction;
        });
        const outcome = harness.start(method);
        harness.requests[0].succeed(harness.database);
        await flush();
        expectFailure(outcome(), error);
      }
    );
  });

  it("rejects a synchronous error while reading a successful result", async () => {
    const { request, outcome } = await begin("get");
    const error = new Error("unreadable result");
    Object.defineProperty(request, "result", {
      get() {
        throw error;
      }
    });
    request.onsuccess?.({ target: request });
    await flush();
    expectFailure(outcome(), error);
  });

  it.each(["versionchange", "close"] as const)(
    "clears a cached connection on %s and opens the next operation afresh",
    async event => {
      const harness = await begin("get");
      succeedTransaction(harness.transaction, "get");
      await flush();
      if (event === "versionchange") harness.database.onversionchange?.({ target: harness.database });
      else harness.database.onclose?.({ target: harness.database });
      expect(harness.database.close).toHaveBeenCalledTimes(event === "versionchange" ? 1 : 0);
      const outcome = harness.start("set");
      expect(harness.open).toHaveBeenCalledTimes(2);
      const database = new ControlledDatabase();
      harness.requests[1].succeed(database);
      await flush();
      harness.database.onclose?.({ target: harness.database });
      succeedTransaction(database.transactions[0], "set");
      await flush();
      expect(outcome()).toEqual({ status: "fulfilled", value: undefined });
      const next = harness.start("get");
      await flush();
      expect(harness.open).toHaveBeenCalledTimes(2);
      succeedTransaction(database.transactions[1], "get");
      await flush();
      expect(next()).toEqual({ status: "fulfilled", value: "saved map" });
    }
  );

  it("rejects a closed cached connection unchanged and reopens on the following call", async () => {
    const harness = await begin("get");
    succeedTransaction(harness.transaction, "get");
    await flush();
    const error = new DOMException("database connection is closing", "InvalidStateError");
    harness.database.transaction.mockImplementationOnce(() => {
      throw error;
    });
    const failed = harness.start("set");
    await flush();
    expectFailure(failed(), error);
    const retry = harness.start("set");
    expect(harness.open).toHaveBeenCalledTimes(2);
    const database = new ControlledDatabase();
    harness.requests[1].succeed(database);
    await flush();
    succeedTransaction(database.transactions[0], "set");
    await flush();
    expect(retry()).toEqual({ status: "fulfilled", value: undefined });
  });
});
