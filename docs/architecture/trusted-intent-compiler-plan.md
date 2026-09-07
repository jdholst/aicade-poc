# Trusted Intent Compiler Implementation Plan

Status: proposed architecture; not implemented.

Last updated: 2026-08-20.

This plan describes how Sparkline should convert a model-authored game-design proposal into trusted, deterministic mechanic routing. It is a future implementation reference, not a description of current production behavior.

## Decision Summary

Sparkline should introduce a trusted intent compiler between creator planning and mechanic resolution.

The model proposes game semantics. The compiler decides executable ownership.

```text
creator prompt
  -> AI design proposal
  -> trusted intent compiler
       -> validate stable references
       -> separate requirement categories
       -> assign canonical semantics
       -> reconcile the draft Game Spec
       -> resolve built-in and trusted game-system coverage
       -> derive any genuinely uncovered executable behavior
  -> compiled creator plan
       -> built-in mechanics
       -> trusted objective/content rules
       -> generated-mechanic requests, when required
       -> complete routing evidence
  -> validation, generation, runtime, and persistence
```

The compiler should become the single authority that connects a creator request, the active Game Spec, built-in coverage, and generated-mechanic work. The provider may interpret natural language, but provider-authored routing strings must not directly decide whether Sparkline generates executable code.

## Motivation

A normal collection-game prompt exposed a split-brain failure:

> Create a small top-down game where the player uses the arrow keys to move around an arena and collect every star. The player wins when all the stars have been collected.

The generated Game Spec correctly selected the existing `player_movement` and `pickup_collection` mechanics. A separately generated `MechanicIntent` did not exactly match every token in the built-in coverage catalog, so the deterministic resolver treated part of the request as uncovered. Routing then fell through to the generated-mechanic path, whose intentionally narrow motion host rejected the collection intent for lacking its required motion capability, canonical trigger, and action connection.

The generated-host errors were valid for that host, but they were secondary symptoms. The original fault occurred earlier: Sparkline allowed two model-authored representations of the same design to disagree, then treated an unmatched string as evidence that new executable behavior was required.

Current relevant seams include:

- [creator planning](../../src/service/creator-generation-planning/)
- [mechanic resolver](../../src/game-spec/mechanics/mechanic-resolver.ts)
- [top-down built-in coverage catalog](../../src/game-spec/mechanics/top-down-built-in-mechanic-contracts.ts)
- [creator routing](../../src/service/creator-generation/creator-generation-routing.ts)
- [generated-mechanic host admission](../../src/service/creator-generation/generated-mechanic-project-planning.ts)
- [GenerationRun receipts](../../src/service/generation-run/)

## Problems to Solve

### Competing sources of truth

The draft Game Spec can say that existing mechanics cover a game while a separate intent says that new behavior is needed. Downstream code then has no trusted answer for which representation owns the design.

### String-shaped semantics

Routing-critical fields such as triggers, behaviors, outcomes, and capabilities are currently easy for a provider to paraphrase. Semantically equivalent phrases can therefore produce different routes.

### Mixed requirement granularity

One intent can mix several kinds of concern:

- world content, such as adding stars;
- player control, such as arrow-key movement;
- reusable mechanics, such as collecting a pickup;
- objectives and completion, such as winning after all stars are collected;
- presentation, such as a victory message;
- genuinely novel executable behavior, such as a dash modifier.

Treating all of these as one mechanic makes any uncovered detail look like a request for generated code.

### Unsafe fallback meaning

`not fully covered by a built-in` must not mean `generate a mechanic`. An unmatched requirement can instead be content, objective logic, an unsupported semantic concept, a provider contradiction, or a clarification need.

### Provider-owned host details

The provider currently has too much influence over low-level values such as capability IDs, lifecycle triggers, action connections, references, and observable outcomes. These values should be derived from trusted catalogs and host adapters once the high-level semantic requirement is known.

### Lost diagnostic evidence

When routing falls through, the creator often sees only the final host-admission failure. The system must preserve the original requirement, the attempted coverage, the reason it was uncovered, and the transformation that led to the final route.

## Goals

- Make compiled routing and the emitted Game Spec agree by construction.
- Resolve each atomic requirement to one explicit owner.
- Keep common content, objectives, and presentation out of generated-mechanic routing.
- Derive host-specific capabilities, triggers, bindings, and observable effects from trusted code.
- Generate executable mechanic code only for a supported, genuinely uncovered behavior.
- Preserve complete, structured provenance for every routing decision.
- Support incremental migration without immediately replacing the current planner or resolver.
- Keep the built-in fast path at zero generated-mechanic provider calls.

## Non-goals

- Expanding the current generated-mechanic host to support every mechanic category.
- Replacing deterministic mechanic coverage with model confidence.
- Creating a universal ontology for every future game genre in the first implementation.
- Silently dropping provider-authored requirements to make a route pass.
- Treating prompt-only aliases as the final semantic boundary.
- Moving runtime validation, generated-source evaluation, or durable handoff into the compiler.

## Domain Model

### Design proposal

The design proposal is model-authored and untrusted. It describes what the game should contain and how it should behave using a small, versioned set of high-level semantic requirements.

The proposal may include:

- entities and their roles;
- controls in creator-facing terms;
- objectives and completion conditions;
- spatial or temporal relationships;
- high-level behavior requirements;
- presentation preferences;
- explicit uncertainty or unsupported requests.

The proposal should not select final runtime owners.

### Semantic requirement

A semantic requirement is one atomic statement that the compiler can classify and resolve independently. The initial taxonomy should be small and schema-enforced.

Candidate requirement kinds:

- `directional_actor_control`
- `overlap_collection`
- `objective_progress`
- `objective_completion`
- `motion_modifier`
- `content_population`
- `presentation_feedback`
- `novel_behavior`

Each kind owns typed fields. For example, `overlap_collection` can refer to an actor role, a target role, and an objective, rather than carrying arbitrary trigger and outcome strings.

### Requirement owner

Every admitted requirement resolves to exactly one owner:

- `built_in_mechanic`
- `trusted_game_system`
- `content_or_presentation`
- `generated_mechanic`
- `unsupported`
- `clarification`

This owner is the key distinction missing from the current intent shape. Only `generated_mechanic` may enter generated contract and source generation.

### Compiled creator plan

The compiled creator plan is trusted, versioned output. It contains:

- a reconciled Game Spec;
- built-in mechanic selections and configurations;
- trusted objective/content/presentation rules;
- zero or more generated-mechanic requests;
- one routing record per semantic requirement;
- contradictions, assumptions, and unsupported requirements;
- stable references to the provider proposal, catalog version, and host profile.

## Proposed Interfaces

The names below are provisional. The important boundary is the ownership split, not the exact TypeScript spelling.

```ts
type CompileCreatorIntentInput = Readonly<{
  proposal: CreatorDesignProposal;
  draftGameSpec: TopDownGameSpec;
  builtInCatalog: BuiltInMechanicCatalog;
  trustedGameSystemCatalog: TrustedGameSystemCatalog;
  hostProfile: GeneratedMechanicHostProfile;
}>;

type CompileCreatorIntentResult =
  | Readonly<{
      kind: "compiled";
      plan: CompiledCreatorPlan;
    }>
  | Readonly<{
      kind: "rejected";
      evidence: IntentCompilationFailureEvidence;
    }>;

function compileCreatorIntent(
  input: CompileCreatorIntentInput,
): CompileCreatorIntentResult;
```

Each routing record should preserve enough evidence to explain the result without reconstructing it from logs:

```ts
type CompiledRequirementRoute = Readonly<{
  requirementId: string;
  requirementKind: SemanticRequirement["kind"];
  owner:
    | "built_in_mechanic"
    | "trusted_game_system"
    | "content_or_presentation"
    | "generated_mechanic"
    | "unsupported"
    | "clarification";
  sourcePaths: readonly string[];
  coverage: readonly RequirementCoverageRecord[];
  assumptions: readonly CompilerAssumption[];
  outputReferences: readonly string[];
}>;
```

Generated-mechanic requests should be compiler-authored:

```ts
type CompiledGeneratedMechanicRequest = Readonly<{
  requirementId: string;
  behavior: SupportedGeneratedBehavior;
  actorEntityId: string;
  targetEntityIds: readonly string[];
  trigger: TrustedHostTrigger;
  requiredCapabilities: readonly TrustedCapabilityId[];
  observableEffect: TrustedObservableEffect;
  config: Readonly<Record<string, JsonValue>>;
}>;
```

The provider may propose the `motion_modifier` semantics. A trusted host adapter should derive values such as `logical_action`, the exact action ID, `object_motion_write`, actor bindings, and motion-observation policy.

## Compiler Stages

### 1. Parse and validate the proposal

Parse the model response against a versioned proposal schema. Reject unknown shapes and retain structured schema issues. Provider output remains untrusted at this boundary.

Completion criterion: every accepted proposal field has a known semantic type, and every rejected field has a stable issue path and code.

### 2. Validate stable references

Resolve proposal references against the draft Game Spec. Use entity roles only when a unique stable ID can be selected deterministically. Record ambiguity when several valid candidates exist.

Completion criterion: every accepted semantic requirement references existing or compiler-created stable IDs; no free-form reference reaches routing.

### 3. Decompose the proposal

Split the design into atomic requirements. Keep content, controls, reusable behavior, objectives, completion, and presentation separate.

Completion criterion: every meaningful proposal statement is represented by at least one requirement, and every requirement has one category.

### 4. Canonicalize semantics

Map each schema-backed requirement kind to trusted semantic definitions. Avoid global string aliasing. Natural-language interpretation belongs before this boundary; canonical semantics belong inside it.

Completion criterion: no routing decision compares an unrestricted provider string with a built-in or host capability token.

### 5. Reconcile the draft Game Spec

Compare the proposal with the mechanics, controls, entities, and objectives already present in the draft Game Spec.

The compiler should diagnose contradictions such as:

- the Game Spec declares a built-in that no proposal requirement needs;
- the proposal needs a built-in that the Game Spec omitted;
- a control references an action unavailable to the selected mechanic;
- an objective has no trusted progress source;
- the proposal and Game Spec bind different actors or targets.

During migration, the compiler may correct deterministic omissions. In the authoritative phase, the compiler should emit the final mechanic list rather than trust the provider-authored list.

Completion criterion: each final Game Spec mechanic and trusted game-system rule is justified by a compiled requirement route.

### 6. Resolve trusted ownership

Resolve atomic requirements independently in this order:

1. content or presentation;
2. trusted objective and game-system behavior;
3. one built-in mechanic;
4. a compatible built-in composition;
5. a supported generated-mechanic behavior;
6. unsupported or clarification.

This ordering prevents objective or content requirements from falling into generated code merely because no built-in mechanic contract owns them.

Completion criterion: every requirement has exactly one owner and complete coverage evidence.

### 7. Derive generated-host details

For requirements owned by `generated_mechanic`, call a trusted adapter for the selected runtime/template host. The adapter derives the exact capability grant, trigger, action connection, entity binding, config constraints, observation policy, and expected effect.

Completion criterion: every generated request satisfies the host profile before any contract-provider call, and none of its routing-critical values came directly from unrestricted provider text.

### 8. Emit the compiled plan

Emit the reconciled Game Spec and complete routing evidence as one versioned result. Persist the result or its immutable identity before downstream generated work begins.

Completion criterion: downstream routing consumes only the compiled plan, and the final Game Spec mechanics exactly match its selected owners.

## Ownership Matrix

| Concern | AI planner | Intent compiler | Host adapter | Downstream pipeline |
| --- | --- | --- | --- | --- |
| Interpret the creator's language | Proposes | Validates typed result | — | — |
| Describe entities, objectives, and high-level behavior | Proposes | Reconciles | — | Consumes |
| Select built-in ownership | — | Owns | — | Consumes |
| Select trusted objective/content ownership | — | Owns | — | Consumes |
| Decide whether executable behavior is genuinely uncovered | — | Owns | Constrains support | Consumes |
| Select capability IDs and lifecycle triggers | — | Requests derivation | Owns | Enforces |
| Bind exact action and entity IDs | Suggests roles | Validates IDs | Owns generated binding | Enforces |
| Author generated contract and source | — | Emits request | Defines limits | Owns |
| Evaluate, hand off, and persist an artifact | — | — | Supplies trusted runtime semantics | Owns |

## Required Invariants

1. A generated request exists only when a semantic requirement is both executable and uncovered by built-ins or trusted game systems.
2. Objective, content, and presentation requirements never become generated mechanics.
3. The final Game Spec mechanic list is derived from the compiled plan.
4. Provider-authored strings never directly select trusted triggers, capability IDs, or runtime bindings.
5. Each requirement has one owner and one complete provenance chain.
6. A generated-host rejection retains the original uncovered requirement and every preceding routing decision.
7. Unknown semantics resolve to `unsupported` or `clarification`; they do not automatically resolve to `generated_mechanic`.
8. The built-in path makes zero generated-mechanic provider, realm, browser-conformance, or handoff calls.
9. A contradiction between the proposal and draft Game Spec is explicit; one representation never silently overrides the other.
10. Compiler output is deterministic for identical proposal, Game Spec, catalog version, and host profile inputs.

## Worked Examples

### Arrow-key star collection

Input semantics:

- a player moves directionally with arrow keys;
- stars populate the arena;
- player overlap collects a star;
- collection advances an objective;
- collecting all stars wins.

Expected compiled routes:

| Requirement | Owner | Output |
| --- | --- | --- |
| Directional player control | `built_in_mechanic` | `player_movement` |
| Star population | `content_or_presentation` | star entities and spawn data |
| Player-star overlap collection | `built_in_mechanic` | `pickup_collection` |
| Collection progress | `trusted_game_system` | objective progress binding |
| Win after all stars | `trusted_game_system` | objective completion rule |

Expected generated requests: none.

This prompt is the primary regression case. It must complete through the built-in fast path even if the provider uses natural phrasing rather than current resolver vocabulary.

### Movement-triggered dash

Input semantics:

- ordinary movement remains available;
- pressing the active movement action temporarily increases player motion;
- the effect is visible and returns to normal automatically.

Expected compiled routes:

| Requirement | Owner | Output |
| --- | --- | --- |
| Directional player control | `built_in_mechanic` | `player_movement` |
| Temporary motion modifier | `generated_mechanic` | one dash request |

The host adapter derives the exact active movement action, `logical_action` trigger, player binding, motion-write capability, bounded config, and observable motion effect. The provider does not invent those tokens.

### Unknown game rule

If the proposal describes a behavior that has no typed semantic kind and no admitted host support, the compiler emits `unsupported` with the original source path and explanation. It does not reinterpret the request as a motion mechanic merely because the current generated host supports motion.

## Evidence and Observability

Store a versioned compilation receipt with the GenerationRun. It should include:

- proposal schema version and sanitized proposal;
- compiler version;
- built-in catalog and generated-host profile versions;
- one route per semantic requirement;
- coverage and contradiction evidence;
- assumptions applied by trusted code;
- the reconciled Game Spec identity;
- generated request identities, if any;
- final route summary and downstream call counts.

Creator-facing errors should summarize the earliest actionable cause. Developer evidence should retain the full route chain. In particular, a capability-gap report should answer:

1. Which original requirement was not covered?
2. Why did each candidate owner decline it?
3. Why was generated work selected or rejected?
4. Which proposal and Game Spec paths produced the requirement?

Do not persist model chain-of-thought or secrets. Persist only structured inputs, outputs, decisions, and issue evidence needed to replay or diagnose the compiler.

## Incremental Migration

### Milestone 0: Preserve evidence

Add complete proposal, normalized intent, coverage, and earliest-failure evidence to the GenerationRun without changing routing behavior.

Exit criteria:

- a capability gap identifies the exact uncovered requirement;
- developer evidence retains both proposal and draft Game Spec paths;
- provider and downstream call counts are visible.

### Milestone 1: Introduce typed requirement categories

Add a versioned proposal schema with a small discriminated requirement taxonomy. Adapt the existing provider prompt and transport to emit it while retaining the legacy intent as a compatibility output.

Run the compiler in shadow mode and compare its proposed owners with current routing.

Exit criteria:

- natural collection and movement prompts compile into atomic typed requirements;
- shadow results are deterministic;
- disagreements are recorded without changing production routes.

### Milestone 2: Reconcile Game Spec and routing

Make the compiler diagnose proposal/Game Spec contradictions and derive an authoritative mechanic selection in shadow mode.

Exit criteria:

- every selected Game Spec mechanic has a requirement route;
- unused or missing built-ins produce structured reconciliation issues;
- the star-collection regression compiles to two built-ins and zero generated requests.

### Milestone 3: Make trusted ownership authoritative

Route content, objectives, presentation, built-ins, and built-in compositions from compiler output. Keep an adapter from compiled requirements to the existing deterministic resolver while it remains useful.

Exit criteria:

- the built-in fast path ignores provider-authored routing tokens;
- built-in-only prompts invoke no generated-mechanic stages;
- legacy and compiled outcomes agree for the supported catalog or produce an intentional migration diagnostic.

### Milestone 4: Derive generated requests through host adapters

Introduce a versioned top-down host adapter that derives exact triggers, action bindings, capabilities, entity bindings, observation policies, and config constraints.

Exit criteria:

- the dash case creates one host-admitted request without provider-authored low-level tokens;
- unsupported generated behaviors fail before contract generation;
- generated-host errors preserve the originating semantic requirement.

### Milestone 5: Retire legacy string routing

Remove unrestricted provider strings from authoritative route decisions. Keep versioned migration adapters only for persisted historical inputs that must remain inspectable.

Exit criteria:

- current production routing consumes compiled plans;
- no legacy free-form field can independently trigger generated code;
- persisted old runs remain readable and clearly identified as legacy.

## Test Plan

### Unit tests

- Proposal schema accepts each supported semantic requirement and rejects unknown fields.
- Decomposition separates content, objective, presentation, built-in, and novel behavior.
- Stable-reference validation rejects missing, duplicate, or ambiguous role bindings.
- Reconciliation detects provider/Game Spec contradictions.
- Identical inputs produce byte-equivalent compiled routing evidence.
- Every compiled requirement has exactly one owner.
- Generated requests can only be produced from supported executable requirement kinds.

### Golden prompt replays

Replay natural creator prompts through the actual planning transport while stubbing paid provider calls where appropriate:

- arrow-key star collection: two built-ins, zero generated calls;
- ordinary movement arena: movement built-in, zero generated calls;
- pickup collection with a normal win condition: built-ins plus trusted objective system;
- movement-triggered dash: movement built-in plus one generated request;
- unsupported novel rule: unsupported or clarification, zero generated contract/source calls;
- contradictory proposal and Game Spec: structured reconciliation failure.

Do not limit these tests to handcrafted canonical intents. At least one replay per major route must use the provider-facing proposal schema and realistic natural language.

### Integration tests

- Creator planning, compilation, routing, and editor entry agree on the same GenerationRun identity.
- Built-in-only plans bypass generated contract, source, realm, browser, and handoff stages.
- Generated plans preserve requirement provenance through repair and acceptance.
- Capability-gap UI shows the earliest uncovered requirement before host-specific secondary issues.
- Persisted compiler receipts survive repository reload.

### Adversarial tests

- Provider changes wording while preserving the same typed semantic requirement.
- Provider supplies conflicting built-in names or capability IDs; trusted derivation wins or rejects the contradiction.
- Provider attempts to disguise content or an objective as `novel_behavior`.
- Unknown requirement kinds fail closed.
- Catalog or host-profile version mismatch prevents reuse of stale compiled output.

## Rollout and Compatibility

- Version the proposal and compiled-plan schemas independently.
- Begin with shadow compilation so current behavior remains available for comparison.
- Store legacy intent evidence alongside the shadow receipt until authoritative routing is stable.
- Put the authoritative compiler behind one explicit rollout switch, with metrics for route agreement, generated-call avoidance, and structured failures.
- Do not reuse compiled output when its catalog, Game Spec, or host-profile identity differs.
- Keep historical GenerationRuns readable; label their routing evidence as legacy rather than fabricating compiler receipts.

## Risks and Open Decisions

### Taxonomy breadth

The first taxonomy must be expressive enough for the top-down POC without becoming an unbounded ontology project. Start from existing built-ins, trusted objective behavior, and the one admitted generated-host family.

### Objective-system ownership

The implementation must decide which objective progress and completion rules are already trusted game-system behavior. This catalog should be explicit, versioned, and separate from mechanic coverage.

### Model autonomy

The provider should be allowed to fill ordinary design gaps, such as selecting a reasonable dash duration, direction rule, or cooldown. The compiler must distinguish these bounded assumptions from routing authority and record each assumption.

### Novel behavior admission

The proposal schema may need a constrained escape hatch for behavior outside the initial taxonomy. That escape hatch should preserve a human-readable description but cannot authorize generated code until trusted code maps it to a supported generated behavior.

### Multi-intent decomposition

One prompt may need several built-ins and more than one objective rule. The compiler should resolve a requirement graph rather than assume one prompt equals one mechanic. Phase 9's generated-mechanic count limits remain a downstream constraint.

### Host abstraction

The first adapter can target the current top-down Phaser host, but the interface should make template/runtime ownership explicit so future hosts do not inherit motion-specific assumptions accidentally.

## Implementation Guardrails

- Add semantics to schemas and trusted catalogs, not prompt-only string aliases.
- Preserve the original requirement when normalization or compilation changes its representation.
- Keep generated-host policy downstream of the decision that behavior is genuinely generated.
- Make the compiler pure and deterministic; perform provider, browser, runtime, and persistence I/O outside it.
- Emit structured issues instead of throwing for expected proposal, coverage, or reconciliation failures.
- Keep the existing resolver as a compatibility seam until compiled routing has equivalent or stronger evidence.
- Track any temporary heuristic or prompt-specific mapping in [the Phase 9 temporary-fix ledger](../phase-09-ticket-16-5-temporary-fix-ledger.md).

## Definition of Done

The trusted intent compiler is complete for the current top-down POC when all of the following are true:

- The compiler is the authoritative source for final Game Spec mechanic ownership.
- Every meaningful proposal requirement has one typed category, one owner, and replayable evidence.
- Natural built-in-only prompts, including the star-collection regression, complete with zero generated-mechanic calls.
- The dash regression routes only its motion modifier into generated work and derives all host details from trusted code.
- Objectives, content, presentation, unsupported semantics, and clarification needs cannot accidentally invoke generated code.
- Proposal/Game Spec contradictions are visible and fail closed.
- GenerationRun evidence identifies the earliest routing cause and every downstream decision.
- Focused unit, golden-replay, integration, adversarial, persistence, lint, and production-build checks pass.
- Temporary compatibility mappings are either removed or recorded with an explicit retirement condition.

## Recommended First Implementation Slice

Start with Milestone 0 and the star-collection regression:

1. Persist the raw normalized intent and full built-in coverage evidence.
2. Add typed categories for directional control, overlap collection, objective progress, and objective completion.
3. Compile the existing star-collection proposal in shadow mode.
4. Assert that the compiled plan selects `player_movement`, `pickup_collection`, and trusted objective completion with zero generated requests.
5. Compare the compiled result with current routing and surface the exact mismatch without changing production behavior.

This slice creates the diagnostic and domain-model foundation needed for later authoritative routing while keeping its blast radius bounded and reversible.
