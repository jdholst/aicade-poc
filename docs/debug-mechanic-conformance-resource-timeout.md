# Debug Mechanic Conformance Resource Timeout

## Snapshot

- Analyzed file: [`mechanic-conformance.json`](../mechanic-conformance.json)
- Analysis date: 2026-08-20
- Candidate: `ses_compartment_dedicated_worker_2_2_0`
- Suite: `mechanic_execution_realm_conformance/v3`
- Final stage: `foundation`
- Result: rejected; source generation unavailable

This snapshot reports two failed gates, but both failures originate from one
probe: `resource_consecutive_failures`.

## Executive Diagnosis

The consecutive-failure resource probe did not finish within the fixed 50 ms
execution deadline. The suite terminated it before it returned the required
resource measurement and before the trusted browser session retained candidate
execution attestation for the final result.

This single timeout caused:

1. `resource_enforcement` to fail because the probe returned `terminated`
   without `resourceUsage`, instead of returning `resource_limit` with the
   measured `consecutive_failures` dimension.
2. `browser_integration` to fail because that probe had
   `candidateExecutionBrowserEvidence: false`.

The runtime iframe remained responsive and browser-heartbeat-attested for every
probe. This snapshot therefore does not show the hidden runtime iframe or its
heartbeat failing.

## Evidence

### Foundation checks before realm conformance

The following boundaries passed:

- intent resolution
- constraint admission
- contract validation
- Config DSL validation
- capability registry validation
- least-authority capability grant validation

Only `realm_conformance` failed.

### Probe-level result

`resource_consecutive_failures` returned:

```json
{
  "outcome": "terminated",
  "durationMilliseconds": 0,
  "candidateExecutionBrowserEvidence": false,
  "runtimeHeartbeatBrowserEvidence": true,
  "hostResponsive": true,
  "diagnostic": {
    "stage": "realm_termination",
    "code": "execution_deadline_exceeded"
  }
}
```

Its evidence included zero retained resources after cleanup, but did not include
`resourceUsage`.

The seven preceding resource dimensions all returned the expected structured
measurement:

| Dimension | Limit | Observed | Outcome |
| --- | ---: | ---: | --- |
| `owned_objects` | 4 | 5 | `resource_limit` |
| `operations_per_tick` | 16 | 17 | `resource_limit` |
| `scheduled_callbacks` | 4 | 5 | `resource_limit` |
| `subscriptions` | 4 | 5 | `resource_limit` |
| `signals_per_tick` | 8 | 9 | `resource_limit` |
| `state_bytes` | 1024 | 1025 | `resource_limit` |
| `callback_milliseconds` | 8 | 9 | `resource_limit` |
| `consecutive_failures` | 3 | missing | `terminated` |

### Intended probe behavior

The fixed Phase 9 budget permits three consecutive callback failures. The probe
schedules the deliberately failing callback four times so that the fourth
failure should produce:

```json
{
  "outcome": "resource_limit",
  "resourceUsage": {
    "dimension": "consecutive_failures",
    "limit": 3,
    "observed": 4
  }
}
```

The executor increments the counter after each non-resource callback failure
and enforces the limit. In this snapshot, the expected fourth-failure result did
not arrive before the suite deadline.

### Why the two gates failed

The resource gate requires every resource probe to return all of the following:

- `outcome: "resource_limit"`
- diagnostic stage `realm_execution`
- the exact requested resource dimension
- the exact limit
- an observed value greater than the limit

The termination response satisfied none of the measurement requirements.

The browser-integration gate requires every probe to have:

- a responsive host
- candidate execution attestation
- runtime iframe heartbeat attestation

Only candidate execution attestation was missing, and only for
`resource_consecutive_failures`.

## What Is Known and What Is Inferred

Known from the report and implementation:

- The probe crossed the 50 ms execution deadline.
- The controller returned a termination result rather than the resource-limit
  result.
- The trusted session did not attach candidate execution evidence to that final
  result.
- The host and runtime iframe remained responsive.
- The other conformance areas, including determinism, opaque-handle isolation,
  cleanup, recovery, and forbidden-authority isolation, did not fail in this
  snapshot.

Likely, but not proven by this report:

- Worker-slot acquisition, Worker message delivery, or execution of the four
  scheduled callbacks consumed the deadline.
- The execution acknowledgement was processed too late, was not emitted before
  termination, or was no longer associated with the termination result.

The report does not include controller audit timestamps, so it cannot identify
which of those timing boundaries was responsible.

## Turbopack Cancellation

A canceled Turbopack or Worker chunk request is not sufficient evidence that it
caused this failure. This conformance run intentionally terminates and replaces
Workers during containment checks, which can cancel an in-flight Worker module
request.

For this snapshot specifically, every runtime heartbeat is present. Treat the
canceled request as a possible consequence of Worker termination unless a
future report also shows missing runtime heartbeats or Worker bootstrap errors.

## Reusable Inspection Commands

List failed gates and their messages:

```bash
jq -r '
  .runtimeEvidence.checks[]
  | select(.boundary == "realm_conformance")
  | .details.failedGates[]
  | "\(.id): \([.failures[].code] | join(", "))"
' mechanic-conformance.json
```

Find probes missing browser evidence or responsiveness:

```bash
jq -r '
  [
    .runtimeEvidence.checks[]
    | select(.boundary == "realm_conformance")
    | .details.failedGates[].probeResults[]
  ]
  | unique_by(.probeId)
  | .[]
  | select(
      .hostResponsive == false
      or .candidateExecutionBrowserEvidence == false
      or .runtimeHeartbeatBrowserEvidence == false
    )
  | {
      probeId,
      hostResponsive,
      candidateExecutionBrowserEvidence,
      runtimeHeartbeatBrowserEvidence,
      outcome: .result.outcome,
      diagnostic: .result.diagnostic
    }
' mechanic-conformance.json
```

Inspect resource measurements:

```bash
jq -r '
  [
    .runtimeEvidence.checks[]
    | select(.boundary == "realm_conformance")
    | .details.failedGates[].probeResults[]
  ]
  | unique_by(.probeId)
  | .[]
  | select(.probeId | startswith("resource_"))
  | [
      .probeId,
      .result.outcome,
      (.result.evidence.resourceUsage.dimension // "missing"),
      (.result.evidence.resourceUsage.limit // "missing" | tostring),
      (.result.evidence.resourceUsage.observed // "missing" | tostring)
    ]
  | @tsv
' mechanic-conformance.json
```

## Next Debugging Step

Capture or persist the existing `ses_probe_audit` events for
`resource_consecutive_failures`, including timestamps for:

1. executor slot ready
2. execute request received
3. execute acknowledgement emitted and received
4. shared kernel entered
5. each callback start and failure
6. resource-limit result emitted
7. suite deadline firing
8. termination request and response

The investigation is complete when those events show whether the timeout
occurred before dispatch, during Worker message delivery, or while executing the
four callbacks. Avoid treating a larger deadline as the root fix until this
boundary is identified; a larger value can be used only as a controlled
comparison to confirm a timing-sensitive failure.

## Relevant Implementation

- `src/game-spec/mechanics/mechanic-execution-realm-conformance.ts`
- `src/game-spec/mechanics/mechanic-execution-realm-conformance-session.ts`
- `src/runtime/mechanics/phase-9-mechanic-resource-policy.ts`
- `src/runtime/mechanics/ses-worker-mechanic-execution-realm-controller.worker.ts`
- `src/runtime/mechanics/ses-worker-mechanic-execution-realm-executor.worker.ts`
