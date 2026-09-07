import { mkdtemp, rm } from "node:fs/promises";
import { createServer, request as createRequest } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { resolveProviderRequest } from "./lib/fixture-adapter.mjs";

const contractRequest = {
  generationRunId: "generation_run_live_12345678",
  stage: "contract",
  attempt: 1,
  attemptKind: "initial",
  stageInput: { intent: { id: "live_intent" } },
};

const contractFixture = {
  ok: true,
  generationRunId: "generation_run_captured_12345678",
  stage: "contract",
  attempt: 1,
  attemptKind: "initial",
  candidate: {
    id: "captured_contract",
    intentId: "captured_intent",
  },
};

describe("provider-mode integration", () => {
  const upstreamCounts = { planning: 0, contract: 0, source: 0 };
  let server;
  let listenBlocked = false;
  let temporaryDirectory;
  let socketPath;

  beforeAll(async () => {
    server = createServer((request, response) => {
      const stage = request.url.slice(1);
      upstreamCounts[stage] += 1;
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: true, stage }));
    });
    temporaryDirectory = await mkdtemp(
      path.join(tmpdir(), "aicade-campaign-provider-")
    );
    socketPath = path.join(temporaryDirectory, "provider.sock");
    try {
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(socketPath, resolve);
      });
    } catch (error) {
      if (error?.code !== "EPERM") throw error;
      listenBlocked = true;
    }
  });

  afterAll(async () => {
    if (server.listening) {
      await new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      );
    }
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  beforeEach(() => {
    upstreamCounts.planning = 0;
    upstreamCounts.contract = 0;
    upstreamCounts.source = 0;
  });

  async function fetchActual(stage) {
    return new Promise((resolve, reject) => {
      const request = createRequest({
        socketPath,
        path: `/${stage}`,
        method: "POST",
        headers: { "content-type": "application/json" },
      }, (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => resolve({
          status: response.statusCode,
          body: JSON.parse(Buffer.concat(chunks).toString("utf8")),
        }));
      });
      request.on("error", reject);
      request.end(JSON.stringify({ stage }));
    });
  }

  it("keeps planning upstream at zero while actual contract and source each pass once", async ({ skip }) => {
    if (listenBlocked) skip("The execution sandbox blocks local server sockets.");
    await resolveProviderRequest({
      stage: "planning",
      mode: "fixture",
      requestBody: { enteredPrompt: "fixture prompt" },
      fixture: { ok: true, spec: {}, routing: {} },
      fetchActual,
    });
    await resolveProviderRequest({
      stage: "contract",
      mode: "actual",
      requestBody: contractRequest,
      fetchActual,
    });
    await resolveProviderRequest({
      stage: "source",
      mode: "actual",
      requestBody: { ...contractRequest, stage: "source" },
      fetchActual,
    });

    expect(upstreamCounts).toEqual({ planning: 0, contract: 1, source: 1 });
  });

  it("keeps planning and contract upstream at zero while actual source passes once", async ({ skip }) => {
    if (listenBlocked) skip("The execution sandbox blocks local server sockets.");
    await resolveProviderRequest({
      stage: "planning",
      mode: "fixture",
      requestBody: { enteredPrompt: "fixture prompt" },
      fixture: { ok: true, spec: {}, routing: {} },
      fetchActual,
    });
    await resolveProviderRequest({
      stage: "contract",
      mode: "fixture",
      requestBody: contractRequest,
      fixture: contractFixture,
      fetchActual,
    });
    await resolveProviderRequest({
      stage: "source",
      mode: "actual",
      requestBody: { ...contractRequest, stage: "source" },
      fetchActual,
    });

    expect(upstreamCounts).toEqual({ planning: 0, contract: 0, source: 1 });
  });
});
