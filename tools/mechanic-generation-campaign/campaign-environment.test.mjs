import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadCampaignWorktreeEnvironment } from "./lib/campaign-environment.mjs";

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    )
  );
});

describe("campaign worktree environment", () => {
  it("loads production credentials, ignores .env.test, and preserves explicit values", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "campaign-env-"));
    temporaryDirectories.push(directory);
    const credentialVariable = "AICADE_CAMPAIGN_ENV_TEST_CREDENTIAL";
    const keyVariable = "KEYWORD_CAMPAIGN_ENV_TEST";
    const explicitVariable = "AICADE_CAMPAIGN_ENV_TEST_EXPLICIT";
    const previousValues = Object.fromEntries(
      [credentialVariable, keyVariable, "KEYWORD_TEST_ONLY", explicitVariable, "NODE_ENV"].map(
        (name) => [name, process.env[name]]
      )
    );

    delete process.env[credentialVariable];
    delete process.env[keyVariable];
    delete process.env.KEYWORD_TEST_ONLY;
    process.env[explicitVariable] = "from-process";

    await Promise.all([
      writeFile(
        path.join(directory, ".env.local"),
        `${credentialVariable}=Campaign Env Test\n${keyVariable}=production-key\n${explicitVariable}=from-file\n`,
        "utf8"
      ),
      writeFile(
        path.join(directory, ".env.test"),
        `${credentialVariable}=Test Only\nKEYWORD_TEST_ONLY=test-key\n`,
        "utf8"
      ),
    ]);

    try {
      const environment = loadCampaignWorktreeEnvironment(directory);

      expect(environment).toMatchObject({
        NODE_ENV: "production",
        [credentialVariable]: "Campaign Env Test",
        [keyVariable]: "production-key",
        [explicitVariable]: "from-process",
      });
      expect(environment.KEYWORD_TEST_ONLY).toBeUndefined();
      expect(process.env.NODE_ENV).toBe(previousValues.NODE_ENV);
    } finally {
      for (const [name, value] of Object.entries(previousValues)) {
        if (value === undefined) {
          delete process.env[name];
        } else {
          process.env[name] = value;
        }
      }
    }
  });
});
