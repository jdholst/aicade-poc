# Context

## Game Pack

A Game Pack is Sparkline's durable saved game project artifact, not just a playable generated code blob. It contains the prompt, editable game spec, source files, assets and provenance, playable build, screenshots, validation logs, publish state, moderation state, remix lineage, and export bundle needed for editing, remixing, publishing, rollback, moderation, and export.

## Runtime Template

Sparkline should begin with one default Phaser JS runtime template rather than multiple user-selectable engines. The current Canvas 2D proof of concept is migration material; the future architecture should move its generation, sandboxing, validation, and editing loop onto a narrow, heavily constrained Phaser template before expanding to more templates or runtimes.

During the current AI-Cade POC, Phaser should be introduced as a new adapter alongside the existing Canvas runtime so the migration can be proven without a risky rewrite. When the product moves to Sparkline v1, it should be fully migrated to Phaser as the default product runtime. Canvas can remain an internal prototype/fallback path during migration, but early users should not be asked to choose between Canvas and Phaser.

The AI-Cade POC should serve as Sparkline's proving ground for game generation and creation technology, not as the full future community platform. The POC should deliberately evolve toward the future Game Pack shape to de-risk Sparkline v1 architecture, especially Phaser migration, compact Game Spec, top-down template, Mechanic Registry, validation evidence, repair loop, safe extension zones, edit records, checkpoints, and simple asset records. Full community integration, monetization, marketplace, and heavy moderation can wait for Sparkline v1 or later product work.

Because the POC is meant to prove versioned game projects, it should introduce lightweight persistence for projects and checkpoints rather than staying purely session-based. It does not need production accounts or community storage, but it should save and reload enough Game Pack, Game Spec, edit history, checkpoint, validation, and repair data to test the creation architecture honestly.

POC persistence should start local and lightweight before introducing a committed production backend database. Browser local storage, IndexedDB, local file import/export, simple JSON-backed dev storage, or a minimal database are acceptable proving-ground options. The goal is to validate what Sparkline needs to save before locking in where that data lives permanently.

The POC should define the Game Pack schema in code before the UI exposes every field. The schema can include optional or experimental fields for future concepts so generation, validation, persistence, and future UI work share a contract, while the product experience exposes the shape gradually.

The Game Pack schema should remain runtime-agnostic even while Phaser becomes the main target. General project concepts such as runtimeKind, templateId, Game Spec, assets, builds, validation, checkpoints, and edit records should be decoupled from Phaser-specific details, which should live under runtime or template-specific config. This keeps Canvas, Phaser, and possible future runtimes supportable as adapters without redefining the whole project model.

The POC should add a runtime adapter interface so Canvas and Phaser can plug into the same host/editor flow. The editor should call a shared adapter contract for creating playable documents or builds, mounting in the sandbox, validating Game Specs, exposing Agent Contracts, running quick checks, producing screenshots or thumbnails, and eventually exporting. The editor should not couple directly to Canvas or Phaser internals.

Playable games should run inside an iframe or equivalent isolated runtime boundary in the POC and long-term Sparkline. The iframe keeps generated/user-edited game logic separate from the Sparkline app UI, auth/session context, DOM, storage, navigation, global CSS, and editor state. This adds messaging complexity, but the safety, reset, embed, validation, and future separate-origin benefits are worth it.

Sparkline should make the game-editor bridge a first-class, versioned, typed protocol rather than ad hoc iframe messages. The main app should be able to send commands such as pause, resume, reset, apply spec patch, select/highlight entity, replace asset, set debug overlay, request screenshot, request observation, and run validation action. The game runtime should emit events such as ready, error, entity selected, observation, recent events, validation result, screenshot captured, missing asset, spec patch applied, and runtime warning.

The editor bridge and Agent Contract should share one typed runtime protocol foundation, with different subsets exposed to different callers. The Sparkline editor uses the protocol for interactive editing and inspection, while validation agents use it for actions, observations, events, reset, screenshots, and playability checks.

## Live Spec Patching

Sparkline's architecture should support live spec patches for small safe edits, while larger structural changes can rebuild or reload the game. Sparkline v1 should eventually live-patch responsive inspector edits such as speed, color, spawn rate, volume, simple toggles, and debug overlays. The POC should prove live patching only for narrow safe edits first, while using regenerate/reload for most edits. Big changes such as adding major mechanics, changing objectives, replacing level layout, or adding boss modules should rebuild/reload until the runtime patch system is mature.

## Template System

Sparkline's first Phaser template should be a top-down game template, but the template system must stay extendable. Shared Game Pack, game spec, validation, publishing, remix, and asset concepts should remain template-neutral, with top-down-specific behavior isolated behind a template ID and template-specific configuration. Future templates such as platformer, puzzle grid, runner, or narrative adventure should be able to plug into the same architecture without redefining the core project model.

## Template-Constrained Generation

Sparkline should generate games by configuring and extending trusted templates, not by freewriting an entire Phaser project from scratch for every prompt. The first top-down Phaser template should own stable lifecycle, scene setup, input, asset loading, sandbox integration, validation hooks, and common mechanics. AI should primarily produce structured game specs, template configuration, assets, rules, levels, objectives, and small constrained extension points.

## Game Spec

A Game Spec is the structured design contract Sparkline creates before generating or changing runtime code. It translates a creator prompt into template-neutral and template-specific data such as template ID, player controls, entities, objectives, rules, assets, map layout, art direction, difficulty, publish metadata, and validation goals. The Phaser template should read the Game Spec as the source of truth wherever possible so games are easier to validate, edit, repair, remix, and publish.

The original prompt should be treated as creator-intent metadata and the game's origin story, not as the source of truth once the game exists. The Game Spec is the current design contract. Sparkline should preserve the original prompt, later prompt/edit history through Edit Records, and a current intent summary so future edits understand both where the game started and what it has become.

The Game Spec should be split into a core spec and template-specific spec. The core spec should hold concepts that apply across runtimes and templates, such as identity, original prompt metadata, current intent summary, template ID, controls, assets, objectives, validation goals, and later publish/version metadata. Template-specific spec sections should hold details for the active template, such as top-down camera settings, arena layout, enemy spawn rules, pickups, projectiles, waves, obstacles, and active top-down Mechanic Modules.

The Game Spec should use strict schemas for core fields Sparkline must trust, such as template ID, controls, assets, active mechanics, objectives, validation goals, and runtime permissions. It should allow flexible versioned extension fields for experimental mechanics, custom behavior parameters, AI-generated extension metadata, and template-specific extras that Sparkline is still learning how to model.

Entities in the Game Spec should use generic roles Sparkline understands, such as player, enemy, pickup, projectile, obstacle, boss, hazard, and UI marker, rather than inventing totally custom entity schemas for every prompt. Custom behavior should live in versioned extension data attached to generic entities. This keeps entities inspectable, editable, validatable, and targetable by mechanics while still allowing unusual game-specific behavior.

Entities should have stable IDs so chat, visual selection, inspector edits, mechanics, assets, validation, version history, and Agent Contract observations can all refer to the same object. Stable entity IDs enable UI affordances such as @ mentions in the chat textbox, where friendly names like @SecurityDrone resolve to exact entity IDs under the hood.

Any object the user or AI may edit later should have a stable ID, including entities, mechanics, assets, objectives, scenes, and important template configuration blocks. Stable IDs give chat, inspector controls, validation, edit records, checkpoints, and future @ mention UI a precise reference system.

The first top-down template should focus on one playable scene or arena for generation reliability and time-to-first-play, but the Game Spec should include a scene model such as a scenes array. This keeps future levels, menus, boss arenas, shops, cutscenes, and multi-scene games possible without redesigning the schema.

The first top-down template should support open arenas as the simplest default while also allowing a modest layout model from the start. The Game Spec should be able to describe arena bounds, spawn zones, wall rectangles, obstacle rectangles or circles, pickup zones, enemy spawn zones, and named regions. Sparkline does not need a full tilemap editor at first, but it should understand basic level layout so games do not all feel like empty rectangles.

Layout should use Sparkline-owned deterministic primitives rather than arbitrary map code. AI can design the layout by filling structured data for arena bounds, wall positions, zone sizes, spawn patterns, obstacle arrangements, pickup locations, and named regions, while the template reliably builds Phaser objects, collisions, spawn zones, and debug overlays from that data.

Layout can still be flexible through extensions. Sparkline should own the layout primitives and collision system, AI should fill layout data, and versioned extensions can add custom behavior to layout objects such as moving walls, key doors, fog zones, conveyor belts, magnetic fields, rhythm-activated platforms, or shrinking arena edges.

Sparkline should eventually support a visual debug overlay for generated top-down games, though this is later-roadmap rather than an immediate implementation requirement. The overlay can show entity bounds, collision bodies, spawn zones, pickup zones, named regions, objective markers, selected entities, and pathing/debug lines for creators, validation, and debugging.

The top-down template should support keyboard controls first for the POC and first creation loop, while keeping mobile/touch controls in mind for Sparkline v1 publish quality. Eventually publishability and discovery should know whether a game supports touch controls, but mobile should not slow down the first Phaser/Game Pack proving path.

## Validation Bars

Sparkline should define separate validation bars for first playable draft and publish/discovery readiness. A first playable draft should optimize for speed and require only that the game boots, has no fatal runtime errors, renders a nonblank canvas, shows the player, responds to controls, and has a basic objective. Publish/discovery readiness should be stricter and require saved validation evidence, screenshot or thumbnail, documented controls, content rating, asset provenance clear enough for public use, AI disclosure, no unsafe runtime behavior, mobile/touch status eventually, and stronger playability/objective checks.

Failed first-playable validation should block the draft from the normal playable view. Sparkline should not present broken games as playable; it should show a friendly repair or failure state with options such as trying repair again, starting over from the prompt, or opening debug details.

Sparkline should save failed generation attempts internally for repair, debugging, known-failure learning, and cost/quality analysis, but failed attempts should not clutter the creator's normal project history. Creator-facing Version Checkpoints should mostly represent meaningful saved playable states; if a failed attempt is repaired successfully, the successful version becomes the checkpoint.

Asset generation should not be required in the first creation pass. The first playable draft can use simple shapes, generated sprites, or Sparkline-owned placeholders, then offer asset generation and replacement as follow-up actions such as generating art, replacing the player, generating enemy sprites, adding background music, or polishing visuals.

Asset replacement should update the project model before runtime code. Replacing an asset should update the relevant Asset Record, entity assetRef or usage reference, provenance/license fields, checkpoint summary, and runtime asset bundle/build. Asset identity should live in the Game Spec and Asset Records rather than being hidden as hardcoded file paths in generated code.

The first Phaser migration milestone should be a single hand-authored top-down game running through the new adapter before adding AI generation. The migration should first prove the Phaser adapter, iframe runtime, ready/error protocol, reset, screenshot or observation if feasible, and Game Spec-driven template configuration with one known game. Only after that should AI generation produce the spec/config, which avoids wasting model tokens while basic runtime migration issues are still being solved.

For the first AI-enabled Phaser milestone, AI should generate only the Game Spec/config for the trusted Phaser template, not custom Phaser source code. Sparkline-owned template source should provide the runtime, modules, layout primitives, protocol, and validation hooks. This intentionally narrows early flexibility to prove reliability and save model cost. Flexibility returns through later stages: AI-generated safe extension modules, versioned extension blocks, safe extension zones, eventual promotion of recurring extensions into built-ins, and full source export.

The first AI-enabled Phaser generator should use a fixed prompt-to-spec schema rather than arbitrary JSON. Sparkline should define the compact Game Spec schema in code, pass it to models through structured output or tool-calling when available, validate every response, run semantic checks for references and supported mechanics, and reject invalid specs from entering the Game Pack. Failed outputs should receive a focused bounded repair pass with exact validation errors; if repair still fails, Sparkline should fall back to a simpler default spec, remove unsupported optional parts, ask the user to simplify, or show a friendly failure state.

## Model Router

Sparkline should support multiple AI providers architecturally while keeping model choice behind the scenes for creators at first. A Model Router should select models by task, such as prompt interpretation, Game Spec generation, mechanic planning, repair/debugging, asset generation, validation review, and checkpoint summaries. Product code should call task aliases such as spec_generation.primary, repair.strong, summary.fast, or image_generation.primary rather than hardcoded raw model IDs.

Sparkline should stay current with flagship models through provider adapters, availability checks, a manually curated model capability registry, Sparkline-specific evals, canary rollouts, exact model ID or snapshot pinning, deprecation/pricing monitoring, and task-level aliases. The newest model should not automatically become the default; it should become default only if it improves Sparkline's quality, schema compliance, latency, and cost for the relevant task.

Sparkline should use Sparkline-managed provider accounts first and defer bring-your-own-key support until later. Managed provider accounts are simpler for reliability, logging, rate limits, cost controls, safety, consistent outputs, support, and abuse control. BYO keys can later serve power users, developers, schools, or teams with existing provider contracts, but they should not complicate the early creation architecture.

Game Specs should prevent rigidity by using a layered model: a stable core shared by all templates, typed schemas for recurring mechanics, and versioned extension blocks for new or experimental mechanics. Stable mechanics should be promoted into typed schemas only after they recur; unusual mechanics should remain in extension blocks until they prove they belong in the core template language.

AI edits should update the Game Spec first, then update or regenerate the Phaser implementation from that spec. Direct code patches should be reserved for cases where the current spec/template system cannot express the requested change, and those cases should feed back into either a versioned extension block or a future promoted mechanic schema.

## Version Checkpoint

A Version Checkpoint is an immutable saved game state created whenever a saved change becomes part of the current game. Checkpoints should capture the Game Spec, template configuration, source/build references, assets, validation status, thumbnail/screenshot, author/source of change, and a short creator-friendly summary. Users should experience checkpoints as a simple history timeline for previewing, restoring, comparing, remixing, publishing, and exporting selected versions. Restoring an older checkpoint should create a new checkpoint rather than deleting newer history.

A Version Checkpoint should be distinct from a Playable Build. The checkpoint is the saved project state or recipe, while the Playable Build is the compiled/runnable output produced from that checkpoint. Builds should store runnable output, build logs, runtime status, screenshots, and validation evidence. Public pages, validation evidence, and hosting should point to exact tested builds rather than rebuilding unpredictably from mutable state.

Sparkline should eventually host public Playable Builds as static artifacts on isolated build URLs rather than rendering every public game dynamically from the app server. Static build hosting supports cheaper serving, faster loads, CDN caching, safer isolation, exact reproducibility, targeted takedowns, and export compatibility. The POC can simulate this locally, while Sparkline v1 can move toward object storage, CDN, and isolated origin hosting.

Sparkline v1 should serve public Playable Builds from a separate origin from the main app, such as a dedicated play/build domain, to prevent generated games from sharing browser security context with the editor, auth/session, local storage, cookies, or sensitive app UI. The POC can simulate or defer separate-origin hosting while proving the runtime architecture.

## Generation Telemetry

The POC should track basic generation and validation telemetry before Sparkline has full public-game analytics. Useful creation-tech metrics include prompt, model/provider used, time to first playable, schema validation failures, repair attempts, build success/failure, runtime errors, validation pass/fail, approximate cost, template/mechanic used, and failure class. This lets Sparkline measure whether the generation architecture is improving.

Generation telemetry should inform POC graduation readiness, but it should not become hard success criteria by itself. Metrics such as first-playable success rate, time-to-first-play, repair frequency, failure classes, checkpoint usefulness, prompt variety, validation usefulness, and cost should guide judgment about when to move toward Sparkline v1, while leaving room for product and founder judgment.

The POC should define a lightweight measurement strategy centered around a GenerationRun record. Each generation, edit, or repair attempt should leave a small internal receipt containing prompt or request, model/provider/task route, template and mechanics used, timestamps and duration, schema validation result, build result, validation result, repair attempts, failure class, approximate cost, and created checkpoint/build IDs when successful.

## Collaboration Scope

Sparkline should focus on a solo creator loop first. Collaboration, team ownership, roles, permissions, merging, real-time editing, and team workflows are out of scope for the POC and should not be central to Sparkline v1 unless demand emerges later. The data model can avoid blocking future collaboration, but early architecture should prioritize individual creators making, editing, validating, remixing, publishing, and exporting games.

## Monetization Scope

Monetization and marketplace design should be out of scope for the POC and initial Sparkline v1 architecture, but should become an important strategy topic once the creation loop proves promise. Monetization affects ownership, licensing, payouts, moderation, taxes/platform rules, fraud, and creator incentives, so Sparkline should not burden the first creation architecture with it before product pull is clearer.

## Live Services Scope

Live services such as leaderboards, cloud saves, multiplayer, achievements, lobbies, and cloud state should be out of scope for the first architecture and POC. Sparkline should first prove generated games as mostly self-contained playable builds, while leaving room to add optional platform services later once the core creation loop works.

## Architecture Document Shape

The Architecture page should be written as a future-facing plan with a clear POC-to-v1 migration section. It should explain the long-term Sparkline architecture, what the AI-Cade POC proves first, what moves into Sparkline v1, what is deferred until later, key risks, and open questions. The document should show the path from today's POC proving ground to the future product.

The Architecture page should include concrete quality targets as placeholders when exact numbers are not known yet. Targets such as time-to-first-play, validation timeout, repair attempt cap, generated build size, nonblank screenshot requirement, and approximate cost per generation should be named with initial or TBD defaults, then revisited as POC telemetry accumulates.

The Architecture page should explicitly distinguish POC acceptance criteria from Sparkline v1 acceptance criteria. The POC should prove the creation engine, such as Phaser adapter, Game Spec/config generation, lightweight persistence, checkpoint/build separation, quick validation, and GenerationRun telemetry. Sparkline v1 should ship the product layer, such as accounts/projects, static build hosting, separate runtime origin, publish/remix flow, public feed, stronger asset provenance, and productionized Model Router. The plan should include advisory criteria for when the POC is ready to move toward v1 without treating metrics as hard gates.

The Architecture page should include a risks and technical debt register for the POC-to-v1 path. It should name risks such as the Phaser template becoming too narrow, extensions becoming unsafe or hard to validate, the Game Spec becoming rigid, iframe protocol complexity, first-playable latency, postponed asset provenance, local POC persistence diverging from backend needs, model routing operational complexity, and community scope creeping into the creation-tech POC.

The Architecture page should include ADR seeds for load-bearing decisions as a decision inventory, but full ADRs can be split into separate pages later. ADR seeds should be grouped into accepted planning decisions and open/proposed decisions. Accepted planning decisions are those resolved in the grill, such as Phaser as v1 default runtime, iframe isolation, Game Pack, Game Spec, template-constrained generation, modular mechanics, validation/repair loop, checkpoint/build separation, Model Router, and open-ended feed first. Open/proposed decisions include exact POC persistence technology, quality thresholds, model/provider defaults, hosting/CDN implementation, moderation depth, monetization, live services, and future runtime expansion.

The Architecture page should include state machines for core lifecycles where they clarify behavior and implementation. Important lifecycles include project, generation, publish, asset, and build lifecycle. State machines should define allowed states, transitions, UI implications, validation rules, permissions, and impossible states to avoid.

The Architecture page should include lightweight C4-style diagrams first, preferably textual or Mermaid diagrams that can be refined later. Useful views include system context, container view, generation/validation runtime flow, artifact lifecycle, and iframe runtime communication. The first draft should make the architecture legible without over-investing in polished diagrams.

The Architecture page should include a glossary of resolved terms from the grill so future implementation agents share the same vocabulary. The glossary should include Game Pack, Game Spec, Version Checkpoint, Playable Build, Mechanic Module, Mechanic Registry, Extension Module, Asset Record, Agent Contract, GenerationRun, Runtime Adapter, Export Bundle, and other load-bearing terms.

The Architecture page should include a "deferred intentionally" section to keep the first plan focused. Deferred topics should include collaboration/team workflows, monetization/marketplace, live services, advanced moderation, Godot/native runtime, bring-your-own-key support, full export ecosystem, comments, challenges/jams, and advanced recommendation/personalization.

Before rewriting the full Notion Architecture page, Sparkline should move from grilling into an editable architecture outline. The outline should let the user adjust section order, remove topics, or shift emphasis before the full page is written.

The Architecture page should include a separate "Technology Choices And Open Stack Decisions" section. It should name known or likely choices such as Next.js/React for the POC frontend/editor, Phaser/JS for the v1 runtime, iframe/separate-origin sandboxing, and Model Router/provider abstraction for AI. It should keep unresolved stack choices explicit, such as production database, object storage/CDN, auth provider, queue/worker system, observability/cost tracking, search/indexing, and moderation tooling. Each unresolved choice should include current POC assumption, v1 default recommendation if known, alternatives, decision timing, and evidence needed.

Sparkline v1 should not blindly copy the POC codebase or restart from scratch. The POC should be treated as a lab and reference implementation. Before v1, POC modules should be classified as promote, rewrite, or discard. Stable schemas, runtime adapters, Phaser template code, Mechanic Modules, validation helpers, Agent Contract/runtime protocol, Game Spec utilities, and other tested creation-engine modules can be promoted with tests and acceptance criteria. Product UI, persistence/storage integration, auth/project management, hosting/deployment integration, and production UX should usually be rewritten around the v1 app structure. Debug-only shortcuts, throwaway experiments, POC-specific state hacks, and temporary provider wiring should be discarded. Transition rule: promote proven architecture, not POC scaffolding.

Publishing should always target a specific Version Checkpoint, not the mutable editor workspace. A creator can continue editing newer drafts after publishing, while public game pages, remix lineage, moderation decisions, export bundles, and challenge submissions remain tied to the exact checkpoint that was published.

## Remix

A Remix is a new private draft project forked from a specific published Version Checkpoint, not from the source project's latest mutable draft. Remixing should copy the Game Spec, template configuration, allowed assets, source/build references, attribution snapshot, and parent checkpoint link into the new project. The original creator's later edits should not mutate existing remixes. Attribution should be automatic and persistent, asset provenance and licenses should travel only when allowed, and public discovery should require a meaningful change rather than a duplicate copy.

Public Sparkline-native projects should be remixable by default, with a clear creator opt-out. Private drafts are not remixable, unlisted previews should keep remixing off by default or creator-controlled, and projects with restricted imported assets may need limited remix permissions even when the project itself is public.

## Public Sharing And Discovery

Sparkline should separate public-by-link sharing from discovery eligibility. A creator should be able to share a playable link quickly once a game passes basic runtime safety checks, while public discovery, search, feeds, tags, challenges, and recommendation surfaces should require a higher bar for metadata, screenshots, controls, content rating, asset provenance, AI disclosure, playability, and moderation state.

## Publish Checklist

A Publish Checklist is the lightweight but real set of requirements a game must satisfy before entering public discovery. It should include title, short description, cover or thumbnail, at least one screenshot, controls, tags/genre, content rating, AI assistance disclosure, asset attribution and license status, passed playability check, and remix permission choice. The checklist provides the metadata Sparkline needs for search, recommendation, moderation, remix credit, and export.

## Asset Record

An Asset Record stores provenance, license, role, and usage for every asset Sparkline knows about. Assets should be created from explicit source types such as AI-generated, uploaded, template, remix-inherited, or external import. Each record should track role, creator/source, license status, attribution requirements, AI disclosure, derived-from links, usage in Version Checkpoints, and whether public use, remix, and export are allowed. Unknown or restricted assets can exist in private drafts, but public discovery, remix travel, and export should require clear enough provenance and rights.

## Validation Evidence

Validation Evidence is the stored proof that a playable build loaded, rendered, responded, and did not obviously break. Publishable builds should keep build logs, boot status, console/runtime errors, screenshot or thumbnail evidence, canvas/activity checks, input simulation results, and simple objective/playability checks where possible. Discovery and broad sharing decisions should rely on this evidence rather than a bare pass/fail flag.

## Validation And Repair Loop

Sparkline should run a bounded validation and repair loop for generated or edited games before they are shown broadly or published. The loop should generate the Game Spec, configure the trusted template, build the playable game, run validation, classify any failure, repair the spec/config/template extension when possible, and rerun validation until success or a capped failure state. Recurring failures should feed a known-failures library with signatures, causes, validated fixes, and future preflight checks, following the useful OpenGame pattern while storing the evidence as Sparkline product data.

## Agent Contract

An Agent Contract is a generated JSON artifact inside the Game Pack that defines how automated validation and future playtesting agents can act on and inspect a game. It should be created from the Game Spec plus template defaults, not handwritten freely by the model. The contract should define valid actions, observations, important game events, reset behavior, and test goals. The Phaser template should implement the contract through a runtime adapter with methods such as observe, act, reset, and getRecentEvents so validation can inspect real game state instead of relying only on screenshots.

## Validation UI

Sparkline should keep validation and repair mostly behind the scenes while showing human-readable status when it matters. Creators should see friendly progress and issue states such as building, testing controls, fixing a loading issue, ready to play, needs asset-rights help, or could not make this playable yet. Detailed logs, stack traces, and repair attempts should be available only in an advanced or debug view.

## Code Access

Sparkline should use layered code access rather than choosing between no-code and full-code editing. Visual/spec editing should be the default. Creators should be able to inspect generated code early so Sparkline is not a black box, but deeper template/runtime code should initially be read-only. In-app manual code edits should be limited to safe, template-aware extension zones such as enemy behavior, scoring rules, spawn logic, custom powerups, level config, UI rules, or template extension scripts. Core lifecycle, sandbox handshake, asset loading, validation adapter, publishing, and export plumbing should remain managed by Sparkline while the project is edited inside the app. At export time, the user should receive the full Phaser source, Game Spec, assets, manifest, attribution/provenance files, package/build config, and README as a detached project; Sparkline no longer guarantees managed round-trip editing for arbitrary full-code changes outside the platform.

## Export Bundle

An Export Bundle is a tracked, versioned export record tied to a specific Version Checkpoint, not a disposable download. It should record who exported it, when it was exported, target format, included files, source/build references, asset license and attribution manifest, AI disclosure, build status, and storage/download reference. Exports are detached portable copies of the game; Sparkline should provide the full project files at export time without promising managed round-trip editing for arbitrary outside changes.

Sparkline should eventually support both playable HTML bundles for static hosting/upload and full source project bundles for outside development, but this is a later roadmap concern rather than an immediate MVP requirement.

## Community Feed

Sparkline should start community discovery with an open-ended feed rather than making challenges or jams the first community mechanic. The feed should let creators browse and discover public games broadly from the start. Game jams, challenges, and structured creation events should come later as additional community formats layered on top of the open-ended feed.

The first feed ranking should be simple and understandable, based mostly on freshness and lightweight engagement such as latest published, recently remixed, most played, most liked or saved, and staff picks. Heavier algorithmic personalization and public voting-heavy ranking should come later after Sparkline has more moderation, trust, and anti-abuse signals.

## Creator Profile

Sparkline should create simple creator profiles early so games belong to people rather than floating as anonymous generated artifacts. Profiles can start with display name, avatar, published games, remixes, liked or saved games, short bio, and joined date. Profiles later support attribution, remix credit, following, moderation history, reputation, badges, and creator trust signals.

## Comments

Sparkline should defer open game comments at first, or launch only with very limited structured feedback controls, until moderation is stronger. Early community engagement should prioritize play count, like/save, remix, report, and possibly structured reactions. Full comments should wait until Sparkline has reporting, moderation queues, user restrictions, and creator controls ready.

## Reporting

Sparkline should include report controls from the start on public games and creator profiles. Reports should capture target type and ID, reason, optional details, reporter, status, and the relevant Version Checkpoint or playable build when applicable. Public publishing requires at least a basic reporting path even if moderation workflows are simple at first.

## Creation Pipeline

Sparkline should build games through explicit phases rather than one opaque generate step, but the product experience should optimize for time-to-first-play. The initial path should do the minimum needed to produce a stable playable draft quickly: interpret prompt, choose the first top-down template, create a compact Game Spec, configure the template, build/play, and run quick validation. Deeper metadata, richer validation evidence, screenshots, asset provenance details, publish checklist suggestions, version summaries, repair suggestions, and export metadata can deepen in the background after the first playable draft exists.

Initial creation should allow very simple assets so the first magic moment stays fast. Sparkline can use built-in shapes, simple generated sprites, or Sparkline-owned placeholder assets for the first playable draft, then let creators generate, upload, replace, polish, and attribute richer assets later.

The initial Game Spec should be intentionally compact and include only what the playable template needs: template ID, controls, entities, objective, mechanics, simple map or layout, difficulty, and validation goals. The spec should expand as the creator edits, adding richer asset provenance, publish metadata, advanced mechanics, checkpoints, accessibility notes, and export configuration over time.

Every accepted AI edit should produce a visible creator-language "what changed" summary. The same summary should become the Version Checkpoint label when the edit is saved, helping creators understand AI changes, trust the edit history, and restore or compare versions intelligently.

Sparkline should show an AI edit plan before applying larger or risky changes, while tiny obvious edits can apply directly. Small edits such as tuning enemy speed can be fast. Larger changes such as adding a boss fight, new phase, upgrade system, or changing the game genre should show a short plan and require confirmation before becoming the current game state.

## Edit Record

An Edit Record links a creator request or manual edit to the actual game changes it produced. It should connect the user message or manual action, optional AI plan, changed Game Spec paths, created Version Checkpoint, validation run, and creator-language summary. This lets Sparkline explain what changed, support undo/restore, identify which edit caused validation failures, and give future AI edits better project history.

## Undo And Restore

Sparkline should support local undo/redo inside the current editing session separately from Version Checkpoint restore. Undo/redo is for short-term editing control within the current session, while checkpoint restore is for larger historical recovery across the life of the project.

## Template Core

The first top-down Phaser template should have a stable core engine layer that AI and users do not normally edit. The core should own Phaser boot/setup, scene lifecycle, input plumbing, camera behavior, collision setup, asset loading, save/load hooks, validation adapter, sandbox/iframe messaging, and basic game loop/state transitions. The Game Spec and safe extension zones should control the creative design layer: player stats, enemy types, spawn rules, objectives, scoring, pickups, map layout, difficulty, theme/art direction, and custom mechanics.

## Mechanic Module

The first top-down Phaser template should ship with a small library of modular, configurable Mechanic Modules for common top-down patterns such as player movement, enemy chasing or patrolling, collectible pickups, projectiles or attacks, health/damage, score, timer, win/loss conditions, spawn waves, and simple obstacles or walls. These modules should be opt-in through the Game Spec: a game can include, exclude, configure, combine, or extend them as needed. Built-in modules provide reliable generation and validation, while versioned extension blocks remain the flexibility path for mechanics the library cannot express yet.

The Game Spec should explicitly list which Mechanic Modules are active in a game and how they are configured. A game should only load the mechanics its spec asks for, so unused modules such as projectiles, timers, or waves can be left out when the design does not need them.

Each Mechanic Module should define its own validation checks and agent contract fragments where possible. If Sparkline turns on a mechanic, Sparkline should know how to test that the mechanic exists and behaves at a basic level, such as checking that enemies chase, collectibles can be picked up, projectiles fire, timers count down, or score changes.

Game Spec mechanics should connect to code through a Mechanic Registry. The spec lists active mechanic configs by type, the registry maps each type to a code factory, and the factory installs the behavior into the Phaser template. AI-generated mechanics should be isolated as versioned extension modules with module references, config, validation goals, and agent contract fragments; recurring generated mechanics can later be promoted into built-in modules.

Sparkline should prefer built-in Mechanic Modules whenever they can express the requested behavior. AI-generated mechanic extensions should be used only when the creator asks for behavior that the current module library cannot represent cleanly.

AI-generated mechanic extensions should be validated more strictly than built-in Mechanic Modules because they are less trusted. Generated extensions should pass type/build checks, banned API scans, sandbox compatibility checks, direct DOM/network/storage restrictions unless explicitly allowed, performance budgets, basic behavior validation, and safe fallback handling when validation fails.

Successful AI-generated mechanic extensions may later be promoted into official built-in Mechanic Modules, but this is a nice-to-have after the core creation loop is stable. Promotion should turn repeated successful extension patterns into Sparkline-owned, versioned modules with stable type names, config schemas, Phaser implementations, validation checks, agent contract fragments, editor controls, examples, and fixtures. Project-scoped generated extensions live inside individual Game Packs; promoted modules live in Sparkline's official versioned template/runtime library and Mechanic Registry.
