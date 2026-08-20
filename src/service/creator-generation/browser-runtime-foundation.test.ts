import { describe, expect, it, vi } from "vitest";

import { createBrowserRuntimeFoundation } from "./browser-runtime-foundation";

describe("createBrowserRuntimeFoundation", () => {
  it("runs browser conformance before the foundation gate and cleans probe resources", async () => {
    const events: string[] = [];
    const realmAdapter = { id: "realm_candidate" };
    const report = { schemaVersion: "realm_report" };
    const gateResult = { status: "passed", sourceGenerationAvailable: true };
    const session = { dispose: vi.fn(() => events.push("dispose_session")) };
    const worker = { terminate: vi.fn(() => events.push("terminate_worker")) };
    const iframe = document.createElement("iframe");
    const mount = document.createElement("div");
    document.body.append(mount);

    const result = await createBrowserRuntimeFoundation({
      ownerDocument: document,
      ownerWindow: window,
      dependencies: {
        createRealmAdapter: vi.fn(() => realmAdapter),
        createWorker: vi.fn(() => worker),
        prepareIframe: vi.fn((candidate) => candidate),
        disposeIframePreparation: vi.fn(() =>
          events.push("dispose_iframe_preparation")
        ),
        loadIframe: vi.fn(async () => {
          events.push("load_iframe");
          mount.append(iframe);
          return iframe;
        }),
        createBrowserSession: vi.fn(() => session),
        runConformance: vi.fn(async () => {
          events.push("run_conformance");
          return report;
        }),
        runFoundationGate: vi.fn(async (input) => {
          events.push("run_foundation_gate");
          expect(input).toEqual({
            realmAdapter,
            realmConformanceReport: report,
          });
          return gateResult;
        }),
      },
    });

    expect(result).toEqual({ gateResult, realmAdapter });
    expect(events).toEqual([
      "load_iframe",
      "run_conformance",
      "run_foundation_gate",
      "dispose_session",
      "terminate_worker",
      "dispose_iframe_preparation",
    ]);
    expect(iframe.isConnected).toBe(false);
    mount.remove();
  });

  it("cleans every acquired browser resource when conformance rejects", async () => {
    const session = { dispose: vi.fn() };
    const worker = { terminate: vi.fn() };
    const iframe = document.createElement("iframe");
    document.body.append(iframe);
    const disposeIframePreparation = vi.fn();

    await expect(
      createBrowserRuntimeFoundation({
        ownerDocument: document,
        ownerWindow: window,
        dependencies: {
          createRealmAdapter: vi.fn(() => ({ id: "realm_candidate" })),
          createWorker: vi.fn(() => worker),
          prepareIframe: vi.fn((candidate) => candidate),
          disposeIframePreparation,
          loadIframe: vi.fn(async () => iframe),
          createBrowserSession: vi.fn(() => session),
          runConformance: vi.fn(async () => {
            throw new Error("conformance failed");
          }),
          runFoundationGate: vi.fn(),
        },
      })
    ).rejects.toThrow("conformance failed");

    expect(session.dispose).toHaveBeenCalledTimes(1);
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    expect(disposeIframePreparation).toHaveBeenCalledWith(iframe);
    expect(iframe.isConnected).toBe(false);
  });
});
