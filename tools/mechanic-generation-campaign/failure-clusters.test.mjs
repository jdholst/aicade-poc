import { describe, expect, it } from "vitest";

import { clusterCampaignFailures } from "./lib/failure-clusters.mjs";

describe("campaign failure clustering", () => {
  it("groups equivalent qualifying failures while excluding infrastructure failures", () => {
    const clusters = clusterCampaignFailures([
      {
        id: "a01",
        status: "pipeline_failed",
        classification: "pipeline_failure",
        furthestStage: "source_validation",
        failure: "Generated source rejected artifact 1234",
      },
      {
        id: "a02",
        status: "pipeline_failed",
        classification: "pipeline_failure",
        furthestStage: "source_validation",
        failure: "Generated source rejected artifact 9876",
      },
      {
        id: "a03",
        status: "infrastructure_failed",
        classification: "infrastructure_failure",
        furthestStage: "submission",
        failure: "Browser closed",
      },
    ]);

    expect(clusters).toEqual([
      expect.objectContaining({
        classification: "pipeline_failure",
        furthestStage: "source_validation",
        count: 2,
        attemptIds: ["a01", "a02"],
        normalizedFailure: "Generated source rejected artifact <n>",
      }),
    ]);
  });
});
