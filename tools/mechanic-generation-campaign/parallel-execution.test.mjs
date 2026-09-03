import { describe, expect, it } from "vitest";

import {
  calculateDispatchCapacity,
  createDispatchBatch,
  createPostPlanningFoundationController,
  createStageConcurrencyController,
  executionPolicyHash,
  resolveExecutionPolicy,
} from "./lib/parallel-execution.mjs";
import { createAttemptSchedule } from "./lib/runner-policy.mjs";

const prompts = [
  { id: "baseline", text: "Baseline" },
  { id: "plain_paraphrase", text: "Paraphrase" },
  { id: "constraints_first", text: "Constraints" },
  { id: "outcomes_first", text: "Outcomes" },
  { id: "compact", text: "Compact" },
];

describe("parallel campaign execution policy", () => {
  it("keeps runs sequential unless a new proof cohort explicitly opts into parallel execution", () => {
    expect(resolveExecutionPolicy({ cohort: "repeatability" })).toMatchObject({
      mode: "sequential",
      maxConcurrentAttempts: 1,
      maxPendingManualQa: 1,
      scheduleOrder: "legacy_prompt_major",
    });

    expect(
      resolveExecutionPolicy({
        cohort: "repeatability",
        policy: {
          mode: "parallel",
          maxConcurrentAttempts: 3,
          maxPendingManualQa: 3,
          stageConcurrency: { planning: 2, contract: 3, source: 2 },
          scheduleOrder: "round_robin",
        },
      })
    ).toMatchObject({
      mode: "parallel",
      maxConcurrentAttempts: 3,
      maxPendingManualQa: 3,
      stageConcurrency: { planning: 2, contract: 3, source: 2 },
      scheduleOrder: "round_robin",
    });

    expect(() =>
      resolveExecutionPolicy({
        cohort: "discovery",
        policy: {
          mode: "parallel",
          maxConcurrentAttempts: 2,
          maxPendingManualQa: 2,
        },
      })
    ).toThrow(/repeatability or variation/i);
  });

  it("uses round-robin prompt order only for explicitly parallel variation runs", () => {
    expect(
      createAttemptSchedule("variation", prompts, {
        scheduleOrder: "round_robin",
      }).map(({ promptId }) => promptId)
    ).toEqual([
      "baseline",
      "plain_paraphrase",
      "constraints_first",
      "outcomes_first",
      "compact",
      "baseline",
      "plain_paraphrase",
      "constraints_first",
      "outcomes_first",
      "compact",
    ]);

    expect(createAttemptSchedule("variation", prompts).slice(0, 2)).toEqual([
      { sequence: 1, promptId: "baseline", prompt: "Baseline" },
      { sequence: 2, promptId: "baseline", prompt: "Baseline" },
    ]);
  });

  it("bounds active work and pending reviews by the remaining failure tolerance", () => {
    const policy = resolveExecutionPolicy({
      cohort: "repeatability",
      policy: {
        mode: "parallel",
        maxConcurrentAttempts: 3,
        maxPendingManualQa: 3,
      },
    });

    expect(
      calculateDispatchCapacity({
        policy,
        failureLimit: 3,
        countedFailures: 0,
        activeAttempts: 0,
        pendingManualQa: 0,
      })
    ).toBe(3);
    expect(
      calculateDispatchCapacity({
        policy,
        failureLimit: 3,
        countedFailures: 1,
        activeAttempts: 1,
        pendingManualQa: 1,
      })
    ).toBe(0);
    expect(
      calculateDispatchCapacity({
        policy,
        failureLimit: 3,
        countedFailures: 2,
        activeAttempts: 0,
        pendingManualQa: 1,
      })
    ).toBe(0);
  });

  it("reserves distinct durable attempt slots before dispatch", () => {
    const schedule = createAttemptSchedule("repeatability", prompts);
    const batch = createDispatchBatch({
      schedule,
      attempts: [{ id: "a01-baseline", sequence: 1 }],
      slots: [
        {
          attemptId: "a02-baseline",
          sequence: 2,
          promptId: "baseline",
          status: "running",
        },
      ],
      capacity: 3,
      leaseOwner: "worker-pool-1",
      now: "2026-08-30T12:00:00.000Z",
    });

    expect(batch.map(({ attemptId }) => attemptId)).toEqual([
      "a03-baseline",
      "a04-baseline",
      "a05-baseline",
    ]);
    expect(batch.every(({ status }) => status === "reserved")).toBe(true);
    expect(batch.every(({ leaseOwner }) => leaseOwner === "worker-pool-1")).toBe(
      true
    );
  });

  it("hashes the complete normalized execution policy", () => {
    const policy = resolveExecutionPolicy({
      cohort: "variation",
      policy: {
        mode: "parallel",
        maxConcurrentAttempts: 3,
        maxPendingManualQa: 2,
        stageConcurrency: { planning: 1, contract: 2, source: 3 },
      },
    });
    expect(executionPolicyHash(policy)).toMatch(/^[a-f0-9]{64}$/);
    expect(executionPolicyHash(policy)).not.toBe(
      executionPolicyHash({
        ...policy,
        stageConcurrency: { ...policy.stageConcurrency, source: 2 },
      })
    );
  });

  it("enforces independent per-stage provider concurrency", async () => {
    const policy = resolveExecutionPolicy({
      cohort: "repeatability",
      policy: {
        mode: "parallel",
        maxConcurrentAttempts: 3,
        maxPendingManualQa: 3,
        stageConcurrency: { planning: 1, contract: 2, source: 3 },
      },
    });
    const controller = createStageConcurrencyController(policy);
    let activePlanning = 0;
    let maxPlanning = 0;
    const tasks = Array.from({ length: 3 }, () =>
      controller.run("planning", async () => {
        activePlanning += 1;
        maxPlanning = Math.max(maxPlanning, activePlanning);
        await new Promise((resolve) => setTimeout(resolve, 5));
        activePlanning -= 1;
      })
    );

    await Promise.all(tasks);
    expect(maxPlanning).toBe(1);
  });

  it("serializes post-planning foundation leases independently of provider stages", async () => {
    const controller = createPostPlanningFoundationController();
    const first = await controller.acquire("attempt-1");
    let secondAcquired = false;
    const secondPromise = controller.acquire("attempt-2").then((release) => {
      secondAcquired = true;
      return release;
    });

    await Promise.resolve();
    expect(secondAcquired).toBe(false);
    expect(controller.release("attempt-1")).toBe(true);
    expect(first()).toBe(false);

    const second = await secondPromise;
    expect(secondAcquired).toBe(true);
    expect(second()).toBe(true);
    expect(controller.release("attempt-2")).toBe(false);
  });
});
