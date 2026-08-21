# Degraded Generation Fallback Plan

Status: recommended first slice implemented for Ticket 16.5; broader eligibility remains deferred to the trusted intent compiler.

Last updated: 2026-08-21.

This plan describes how creator generation may return a playable base game when an optional Mechanic Intent cannot be safely routed. It is a bounded fallback to improve end-to-end generation yield before the [Trusted Intent Compiler](./trusted-intent-compiler-plan.md) becomes authoritative.

The implemented Ticket 16.5 slice covers malformed intent transport and pre-generation capability/generated-host admission failures. Clarification failures, reference ambiguity, and constraint conflicts remain fatal because the current envelopes do not provide trusted requirement-ownership evidence proving that those behaviors are optional. That is a deliberate fail-closed boundary, not an unfinished attempt to treat every validation error as a warning.

## Ticket 16.5 implementation record

Implemented on the `mechanic-generation` branch:

- layered planning-envelope parsing retains a valid Game Spec and bounded intent transport evidence;
- one pure policy switch classifies supported failures and rejects every post-start generated-work state;
- dispatch returns a distinct `degraded` result with the independently validated base spec and zero generated continuation calls; provider-authored mechanic-connection metadata that the built-in runtime does not execute is removed from a cloned fallback spec before persistence;
- the policy reruns trusted Game Spec validation and the ordinary editor path still requires first-playable validation before durable success;
- GenerationRun metadata records the omission, original routing issues, fallback validation proof, and zero generated-stage calls without generated-artifact lineage;
- creator UI presents a concise limited-functionality warning with expandable developer details;
- developer JSON export preserves the degraded receipt after repository reload;
- TF-12 in the [temporary-fix ledger](../phase-09-ticket-16-5-temporary-fix-ledger.md) records the collection-specific proof and compiler-based retirement condition.

Manual QA can compare the blocking and degraded paths by adding `?degradedGenerationFallback=off` (or `=0`) to the editor URL. Omitting the parameter keeps the Ticket 16.5 policy enabled. The switch changes only the pre-generation fallback decision; it does not alter stored full-success or accepted generated-artifact semantics.

Still intentionally deferred:

- clarification, invalid-reference, and constraint-conflict fallback without trusted optionality evidence;
- post-contract/source/foundation/evaluation/handoff recovery;
- mechanic-only retry and omission-rate product telemetry.

## Decision Summary

Add a distinct `degraded` generation outcome for pre-generation intent and routing failures.

The fallback retains an independently valid base Game Spec, omits only unaccepted generated-mechanic work, revalidates the remaining game, and tells the creator exactly which requested behavior was omitted.

```text
creator planning response
  -> parse and validate base Game Spec independently
  -> parse, validate, and route Mechanic Intent
       -> built-in route: return base Game Spec
       -> generated route: continue generated pipeline
       -> eligible intent/routing failure:
            omit generated extension request
            revalidate base Game Spec
            remove non-executed mechanic-connection metadata from a clone
            prove first-playable behavior
            return degraded Game Spec + warning evidence
       -> ineligible or unsafe failure: stop generation
```

This is not a global conversion of validation errors into warnings. The fallback is permitted only when trusted checks prove that the remaining base game is coherent and playable.

## Motivation

The current planning response couples `gameSpec` and `mechanicIntent`. An invalid or unsupported intent can stop the entire generation even when the Game Spec already describes a valid built-in game.

The collection-game regression demonstrates the cost. Its Game Spec selected existing `player_movement` and `pickup_collection` mechanics, but intent routing fell through to the narrow generated-mechanic host and produced a capability gap. The host rejection stopped the editor rather than allowing the valid built-in game to run.

For the POC, a visible partial success can be more useful than a complete stop:

> Game generated with limited functionality. The requested dash could not be safely added, so the playable base game was retained without it.

The creator must be able to distinguish that result from full success.

## Current Boundaries

Current relevant seams include:

- [combined creator-planning transport](../../src/service/creator-generation-planning/creator-generation-planning-schema.ts)
- [planning service](../../src/service/creator-generation-planning/creator-generation-planning-service.ts)
- [creator routing](../../src/service/creator-generation/creator-generation-routing.ts)
- [generation dispatcher](../../src/service/creator-generation/creator-game-generation-dispatcher.ts)
- [editor generation orchestration](../../src/service/generation-run/editor-generation-run.ts)
- [GenerationRun receipt lifecycle](../../src/service/generation-run/phaser-generation-run-receipt-lifecycle.ts)
- [first-playable validation](../../src/game-spec/game-pack/first-playable-validation.ts)

Today:

1. The transport parser requires both a valid Game Spec envelope and a structurally valid Mechanic Intent.
2. Semantic routing produces `built_in`, `generated_mechanic`, `clarification_failure`, `capability_gap`, or `constraint_conflict` outcomes.
3. The dispatcher turns non-built-in, non-generated outcomes into `rejected`.
4. Editor orchestration converts that rejection into a terminal `mechanic_validation` failure.

The new policy adds a trusted decision between routing rejection and terminal editor failure.

## Scope

### In scope

- Intent transport failures when a Game Spec can still be independently recovered and validated.
- Invalid optional intent references.
- Unresolved reversible intent ambiguity.
- Capability gaps before generated contract or source work begins.
- Generated-host admission failures before generated work begins.
- Constraint conflicts that do not invalidate the base game.
- Creator-facing warnings, developer evidence, and GenerationRun receipts for omitted mechanics.
- Revalidation of the exact fallback Game Spec.
- Zero generated-mechanic calls after fallback is selected.

### Out of scope for the first slice

- Recovering from generated contract, source, foundation, conformance, browser-evaluation, handoff, or persistence failures.
- Rolling back an accepted or partially persisted generated artifact.
- Automatically repairing the rejected intent.
- Retrying only the omitted mechanic from the UI.
- Supporting several independent generated intents in one plan.
- Replacing deterministic routing with best-effort model judgment.

## Core Terms

### Base Game Spec

The validated Game Spec produced before any generated-mechanic extension is assembled or accepted. The fallback may return this spec only after validating its exact persisted or returned shape.

### Omitted mechanic

The requested generated behavior that routing could not safely admit. The omission does not remove trusted built-ins, objectives, content, or presentation already present in the valid base Game Spec.

### Degraded success

A successful generation result containing a playable Game Spec plus structured warning evidence that one requested behavior was omitted.

### Fatal failure

A failure for which Sparkline cannot prove that the remaining game is coherent, safe, and playable. Fatal failures retain the existing terminal behavior.

## Safety Invariants

1. Degraded success returns only an independently valid base Game Spec.
2. The fallback omits generated work; it does not broadly delete everything described by the intent.
3. No generated contract, source, realm, browser, handoff, or persistence call begins after fallback selection.
4. A Game Spec that depends on the omitted generated behavior remains fatal.
5. Security, schema-integrity, lineage, and persistence failures remain fail-closed.
6. Accepted or ambiguously committed generated artifacts never use this fallback.
7. The creator sees the omitted behavior before interacting with the game.
8. GenerationRun distinguishes full success from degraded success.
9. The original failure evidence remains available for diagnosis and later retry.
10. Identical planning inputs and validation evidence produce the same fallback decision.

## Eligibility Policy

The fallback decision must be made by trusted code. Provider claims that a mechanic is optional are advisory only.

### Eligible failure classes

| Failure | Eligible when |
| --- | --- |
| Invalid intent transport | The response still contains a separately parseable, valid Game Spec |
| Invalid intent reference | The base Game Spec does not depend on that reference or a generated extension |
| Clarification failure | The unresolved behavior can be omitted without invalidating the base game |
| Missing generated capability | No generated work has begun and the base game remains valid |
| Generated-host trigger or connection rejection | No extension is present in the fallback Game Spec |
| Generated-mechanic count conflict | The base game is valid without the rejected generated request |

### Fatal failure classes

| Failure | Reason |
| --- | --- |
| Base Game Spec schema or semantic validation failure | No trustworthy fallback artifact exists |
| Missing player, controls, required movement, or core objective | The game is not independently playable |
| Objective depends on the omitted behavior | The fallback may be unwinnable |
| Base Game Spec references a generated extension, artifact, or unresolved mechanic connection | Omission would leave dangling lineage or behavior |
| Provider response cannot yield a complete Game Spec | Nothing safe can be recovered |
| Authentication, authorization, or transport-integrity failure | Trust boundary remains fail-closed |
| Generated contract/source/evaluation has started | Outside the first-slice recovery boundary |
| Durable acceptance is pending, finalized, or ambiguous | Cross-store lineage must be reconciled, not downgraded |
| Persistence or repository consistency failure | Success cannot be durably proven |

### Decision predicate

The exact type is provisional, but the policy should be centralized:

```ts
type DegradedGenerationEligibilityInput = Readonly<{
  baseGameSpec: TopDownGameSpec;
  generationRunId: StableId;
  routingFailure: CreatorGenerationRoutingFailure;
  generatedWorkState: "not_started" | "started" | "persisted" | "ambiguous";
}>;

type DegradedGenerationEligibility =
  | Readonly<{
      kind: "eligible";
      warning: OmittedMechanicWarning;
    }>
  | Readonly<{
      kind: "fatal";
      issues: readonly DegradedGenerationIssue[];
    }>;
```

Eligibility must remain a pure, deterministic decision. Runtime and persistence checks consume its result but do not redefine it.

## Proposed Result Model

Add an explicit route or dispatch result instead of reusing `built_in` or pretending the intent succeeded:

```ts
type DegradedCreatorGenerationResult = Readonly<{
  kind: "degraded";
  generationRunId: StableId;
  result: TopDownSpecGenerationClientResult;
  warning: Readonly<{
    stage: "mechanic_validation";
    code: "generated_mechanic_omitted";
    intentId?: StableId;
    summary: string;
    issues: readonly CreatorGenerationRoutingIssue[];
    omittedBehavior?: string;
    retryable: boolean;
  }>;
}>;
```

The final naming may instead use `succeeded_with_warnings`, but the representation must be a discriminated outcome throughout the pipeline.

Do not encode degraded success as:

- an ordinary built-in success;
- a terminal failure with a playable artifact attached;
- a free-form warning string;
- an accepted generated-mechanic result without an artifact.

## Implementation Sequence

### Step 1: Split envelope parsing

Parse the planning response in layers:

1. validate the outer object and retain bounded raw fields;
2. parse `gameSpec` through the existing spec-generation validation/repair loop;
3. parse `mechanicIntent` independently;
4. return structured intent transport issues without discarding a valid Game Spec.

The provider tool schema may remain strict. This change affects how returned data is recovered and classified, not what the provider is asked to produce.

Completion criterion: a valid Game Spec plus malformed intent produces a typed planning result containing the valid spec and exact intent issues.

### Step 2: Add one fallback policy function

Create a pure policy boundary that receives the exact base Game Spec, routing failure, and generated-work state.

It should verify:

- the base Game Spec has no generated extension dependency;
- its controls, entities, objectives, mechanics, and references are valid;
- the failure belongs to the initial eligible allowlist;
- generated work remains `not_started`;
- an omission warning can identify the requested behavior.

Completion criterion: every routing failure maps deterministically to `eligible` or `fatal`, with tests for every listed class.

### Step 3: Add the degraded dispatch outcome

Teach creator dispatch to return `degraded` for eligible failures. Preserve the exact base spec and remove only routing metadata from the runtime-facing result.

The dispatcher must not call generated continuation after selecting the fallback.

Completion criterion: eligible failures return the base spec with warning evidence and prove zero generated continuation calls.

### Step 4: Revalidate the fallback artifact

Run the normal Game Spec and first-playable validation path against the exact fallback spec. Do not infer playability from the fact that the spec passed earlier planning validation.

If validation fails, convert the degraded candidate into a fatal structured failure that includes:

- the original intent/routing issues;
- the fallback validation issues;
- the omitted behavior identity.

Completion criterion: no degraded result reaches the editor runtime until the exact fallback artifact passes the existing acceptance checks.

### Step 5: Persist an honest GenerationRun receipt

Record degraded generation distinctly from full success. The receipt should preserve:

- original creator prompt;
- base Game Spec identity;
- intent ID or transport issue path;
- routing result and issues;
- omitted behavior summary;
- zero generated-provider and generated-runtime calls after fallback;
- fallback validation evidence;
- final status such as `succeeded-with-warnings` or an equivalent versioned outcome.

Do not attach generated artifact IDs, acceptance relationships, or generated-mechanic lineage.

Completion criterion: repository reload reproduces the degraded status and warning without inventing generated acceptance.

### Step 6: Add creator and developer UI

The creator-facing surface should be concise:

> Game generated with limited functionality
>
> The requested dash could not be safely added. The playable base game was generated without it.

It should include an action such as `Retry mechanic` only after a mechanic-only retry flow exists. Until then, offer `Regenerate` and `View details`.

Developer details should show:

- stage and stable issue codes;
- omitted intent/behavior;
- original routing evidence;
- fallback validation result;
- generated-stage call counts;
- GenerationRun ID.

Completion criterion: the creator can identify the missing behavior without reading JSON, and developers can reconstruct why it was omitted.

### Step 7: Roll out behind an explicit policy switch

Introduce one fallback-policy switch so manual QA can compare terminal failure with degraded success using the same replayed planning payload.

Track:

- full success rate;
- degraded success rate;
- fatal failure rate;
- omission frequency by issue code;
- first-playable failure after attempted fallback;
- requests that users immediately regenerate;
- generated-provider calls avoided.

Completion criterion: the switch can be disabled without changing stored full-success semantics, and replay evidence shows no generated work after fallback selection.

## Test Plan

### Transport tests

- Valid Game Spec plus malformed intent retains the Game Spec and emits intent issues.
- Invalid Game Spec plus valid intent remains fatal.
- Invalid outer response remains fatal.
- Unknown or oversized intent data cannot bypass transport limits.

### Policy tests

- Capability gap with a valid independent base spec is eligible.
- Unsupported trigger or action connection is eligible before generated work starts.
- Invalid intent reference is fatal when the base spec depends on it.
- Missing core movement or objective behavior is fatal.
- `started`, `persisted`, and `ambiguous` generated-work states are fatal.
- Identical inputs produce identical decisions and warning evidence.

### Dispatcher tests

- Eligible routing failure returns `degraded` with the independently validated, connection-sanitized base spec.
- Generated continuation receives zero calls.
- Built-in and generated success paths remain unchanged.
- Fatal routing failures retain structured terminal evidence.

### Game validation tests

- Star collection retains `player_movement`, `pickup_collection`, objective progress, and completion.
- Dash omission leaves ordinary movement playable.
- Omission that makes an objective unreachable becomes fatal.
- A base spec containing a generated extension reference is rejected.

### GenerationRun tests

- Degraded success survives repository reload.
- Receipt contains omission and fallback-validation evidence.
- Receipt contains no generated artifact or acceptance lineage.
- Cancellation, timeout, or persistence failure cannot be rewritten as degraded success.

### UI tests

- Creator sees `generated with limited functionality` and the omitted behavior.
- Long developer evidence is available through details rather than one concatenated message.
- Full success has no degraded warning.
- Fatal failure retains its blocking state.

### End-to-end replay tests

- Collection prompt with the previously failing intent produces a playable built-in game and zero generated calls.
- Dash prompt with valid generated routing still runs the generated pipeline.
- Dash prompt with an eligible host-admission failure returns ordinary movement plus an explicit dash-omitted warning.
- A prompt whose primary objective requires the rejected mechanic remains blocked.

## Risks and Mitigations

### Prompt fidelity loss

Risk: the game runs but does not satisfy the full request.

Mitigation: visible degraded status, named omission, preserved evidence, and separate telemetry from full success.

### Unwinnable fallback

Risk: the omitted mechanic supplies objective progress or completion.

Mitigation: validate dependencies and run first-playable checks on the exact fallback spec. Treat any dependency uncertainty as fatal.

### Over-broad intent removal

Risk: one broad intent describes built-ins, content, objectives, and generated behavior together.

Mitigation: retain the independently valid base Game Spec and omit only unaccepted generated work. Never delete all mechanics mentioned by the intent.

### Hidden planner regressions

Risk: improved apparent generation success conceals frequent invalid intents.

Mitigation: report degraded success separately and alert on omission rates by issue code.

### Trust-boundary weakening

Risk: malformed or hostile output reaches runtime because validation became a warning.

Mitigation: keep schema-integrity and security checks fatal; only the isolated optional intent may be omitted. Revalidate the remaining artifact through trusted paths.

### Ambiguous persistence

Risk: a generated artifact is partially committed before fallback.

Mitigation: first release supports only `generatedWorkState: "not_started"`. Existing acceptance reconciliation remains authoritative for every later state.

### Permanent temporary behavior

Risk: degraded fallback becomes a substitute for correct routing.

Mitigation: record the implementation in [the temporary-fix ledger](../phase-09-ticket-16-5-temporary-fix-ledger.md), define removal criteria, and measure how often it fires.

## Temporary-fix Ledger Entry

When implemented as the pre-compiler POC fallback, add an active entry with:

- shortcut: eligible pre-generation intent failures return a validated base game with an omission warning;
- risk: creator requests can partially succeed without the requested mechanic;
- guardrails: independent spec validation, no generated work, visible warning, distinct receipt, first-playable proof;
- robust replacement: trusted intent compiler with atomic requirement ownership;
- removal criteria: compiler routes built-ins, trusted game-system behavior, and generated requests authoritatively, leaving fallback only for explicitly optional feature failure policy.

## Definition of Done

The first degraded-generation fallback is complete when:

- Planning can retain a valid Game Spec when only its intent is malformed.
- One centralized policy classifies every supported routing failure as eligible or fatal.
- Eligible failures return a distinct degraded result and never invoke generated continuation.
- The exact fallback Game Spec passes normal validation and first-playable checks.
- Collection-game fallback preserves its built-ins and remains winnable.
- Dash fallback preserves ordinary movement and names the omitted dash.
- GenerationRun stores degraded status, omission evidence, validation evidence, and zero generated lineage.
- Creator UI distinguishes limited functionality from full success and fatal failure.
- Fatal, security-sensitive, post-generation, persistence, and ambiguous-acceptance cases remain fail-closed.
- Unit, integration, replay, persistence, cancellation, UI, lint, and production-build checks pass.
- The temporary-fix ledger records the policy and its compiler-based retirement condition.

## Recommended First Slice

Implement one tracer case around the collection-game regression:

1. Split planning-envelope parsing so a valid Game Spec survives an invalid or rejected intent.
2. Admit fallback only for `capability_gap` and generated-host admission issues while generated work is `not_started`.
3. Return the validated base Game Spec as `degraded`; if the provider included mechanic-connection metadata, remove it from a clone because the trusted built-in runtime does not execute that plan.
4. Prove it contains `player_movement`, `pickup_collection`, and a completable objective.
5. Prove generated continuation, provider, realm, browser, handoff, and generated persistence calls remain zero.
6. Display one concise creator warning and retain full developer evidence.

This slice improves POC yield without generalizing failure recovery across the more dangerous post-generation and persistence boundaries.
