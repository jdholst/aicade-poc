import { createHash, randomUUID } from "node:crypto";

const STAGES = ["planning", "contract", "source"];
const PARALLEL_COHORTS = new Set(["repeatability", "variation"]);

export function resolveExecutionPolicy({ cohort, policy } = {}) {
  if (!policy) {
    return withPolicyHash({
      mode: "sequential",
      maxConcurrentAttempts: 1,
      maxPendingManualQa: 1,
      stageConcurrency: { planning: 1, contract: 1, source: 1 },
      scheduleOrder: "legacy_prompt_major",
    });
  }

  const mode = policy.mode ?? "sequential";
  if (!new Set(["sequential", "parallel"]).has(mode)) {
    throw new Error(`Unsupported campaign execution mode "${mode}".`);
  }
  if (mode === "parallel" && !PARALLEL_COHORTS.has(cohort)) {
    throw new Error(
      "Parallel execution is available only for repeatability or variation campaigns."
    );
  }

  const maxConcurrentAttempts =
    mode === "sequential" ? 1 : boundedInteger(policy.maxConcurrentAttempts, 1, 3, "maxConcurrentAttempts");
  const maxPendingManualQa =
    mode === "sequential" ? 1 : boundedInteger(policy.maxPendingManualQa, 1, 3, "maxPendingManualQa");
  const stageConcurrency = Object.fromEntries(
    STAGES.map((stage) => {
      const value = mode === "sequential"
        ? 1
        : boundedInteger(
            policy.stageConcurrency?.[stage] ?? maxConcurrentAttempts,
            1,
            maxConcurrentAttempts,
            `stageConcurrency.${stage}`
          );
      return [stage, value];
    })
  );
  const scheduleOrder =
    policy.scheduleOrder ?? (mode === "parallel" ? "round_robin" : "legacy_prompt_major");
  if (!new Set(["legacy_prompt_major", "round_robin"]).has(scheduleOrder)) {
    throw new Error(`Unsupported campaign schedule order "${scheduleOrder}".`);
  }

  return withPolicyHash({
    mode,
    maxConcurrentAttempts,
    maxPendingManualQa,
    stageConcurrency,
    scheduleOrder,
  });
}

export function executionPolicyHash(policy) {
  const hashInput = { ...policy };
  delete hashInput.hash;
  return createHash("sha256").update(canonicalJson(hashInput)).digest("hex");
}

export function calculateDispatchCapacity({
  policy,
  failureLimit,
  countedFailures,
  activeAttempts,
  pendingManualQa,
}) {
  const workerCapacity = Math.max(
    0,
    policy.maxConcurrentAttempts - activeAttempts
  );
  const reviewCapacity = Math.max(
    0,
    policy.maxPendingManualQa - pendingManualQa - activeAttempts
  );
  const riskCapacity = failureLimit === undefined
    ? workerCapacity
    : Math.max(
        0,
        failureLimit - countedFailures - activeAttempts - pendingManualQa
      );
  return Math.min(workerCapacity, reviewCapacity, riskCapacity);
}

export function createDispatchBatch({
  schedule,
  attempts,
  slots,
  capacity,
  leaseOwner = randomUUID(),
  now = new Date().toISOString(),
}) {
  if (capacity <= 0) return [];
  const claimedSequences = new Set([
    ...attempts.map(({ sequence }) => sequence),
    ...slots
      .filter(({ status }) => !["cancelled", "interrupted"].includes(status))
      .map(({ sequence }) => sequence),
  ]);
  return schedule
    .filter(({ sequence }) => !claimedSequences.has(sequence))
    .slice(0, capacity)
    .map((entry) => ({
      attemptId: createAttemptId(entry),
      sequence: entry.sequence,
      promptId: entry.promptId,
      submissionKind: entry.submissionKind ?? "scheduled",
      ...(entry.replacementForPromptId
        ? { replacementForPromptId: entry.replacementForPromptId }
        : {}),
      status: "reserved",
      leaseId: randomUUID(),
      leaseOwner,
      leasedAt: now,
      updatedAt: now,
    }));
}

export function createAttemptId({ sequence, promptId }) {
  return `a${String(sequence).padStart(2, "0")}-${promptId}`;
}

export function createStageConcurrencyController(policy) {
  const semaphores = Object.fromEntries(
    STAGES.map((stage) => [stage, createSemaphore(policy.stageConcurrency[stage])])
  );
  return {
    acquire(stage) {
      const semaphore = semaphores[stage];
      if (!semaphore) throw new Error(`Unknown provider stage "${stage}".`);
      return semaphore.acquire();
    },
    async run(stage, operation) {
      const release = await this.acquire(stage);
      try {
        return await operation();
      } finally {
        release();
      }
    },
  };
}

export function createPostPlanningFoundationController() {
  const semaphore = createSemaphore(1);
  const pending = new Set();
  const releases = new Map();
  return {
    async acquire(attemptId) {
      if (pending.has(attemptId) || releases.has(attemptId)) {
        throw new Error(
          `Attempt "${attemptId}" already owns or awaits a foundation lease.`
        );
      }
      pending.add(attemptId);
      let releasePermit;
      try {
        releasePermit = await semaphore.acquire();
      } finally {
        pending.delete(attemptId);
      }
      let active = true;
      const release = () => {
        if (!active) return false;
        active = false;
        if (releases.get(attemptId) === release) {
          releases.delete(attemptId);
        }
        releasePermit();
        return true;
      };
      releases.set(attemptId, release);
      return release;
    },
    release(attemptId) {
      return releases.get(attemptId)?.() ?? false;
    },
  };
}

function withPolicyHash(policy) {
  return { ...policy, hash: executionPolicyHash(policy) };
}

function boundedInteger(value, minimum, maximum, field) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${field} must be an integer from ${minimum} through ${maximum}.`);
  }
  return value;
}

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function createSemaphore(limit) {
  let active = 0;
  const waiting = [];
  const dispatch = () => {
    while (active < limit && waiting.length > 0) {
      active += 1;
      const resolve = waiting.shift();
      let released = false;
      resolve(() => {
        if (released) return;
        released = true;
        active -= 1;
        dispatch();
      });
    }
  };
  return {
    acquire() {
      return new Promise((resolve) => {
        waiting.push(resolve);
        dispatch();
      });
    },
  };
}
