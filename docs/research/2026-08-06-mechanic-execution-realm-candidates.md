# Mechanic Execution Realm candidate research

Date checked: 2026-08-06
Scope: Phase 09 Ticket 08 shortlist, task-local research
Decision status: SES Worker selected after the first complete hard-gate pass

## Executable disposition

The SES `Compartment` plus dedicated-Worker architecture was the first candidate
evaluated from the Ticket 08 shortlist. In system Chrome 150, the production
controller and executor Workers passed the unchanged
`mechanic_execution_realm_conformance/v3` corpus: 32 probes, ten hard gates,
and paired candidate/runtime browser evidence. The controller Worker is the
captured candidate endpoint; it dispatches exact probe source into a prewarmed
inner SES executor Worker before acknowledging execution. The whole-game
runtime remains a distinct prepared opaque-origin iframe.

The same production adapter proof also established token-only transport for a
real Ticket 06 object handle, exact granted and ungranted capability behavior,
hard runaway termination, fresh recovery, deterministic seeded replay,
operations-budget enforcement, disposal rejection, and nested-Worker cleanup.
Repeated warm and isolated cold-cache runs passed. The npm production audit
reported no advisory attributable to `ses@2.2.0` or its three added Endo
dependencies.

The evaluated package is pinned to exactly `ses@2.2.0`, and the candidate ID is
defined once beside the adapter. A post-pass adversarial review found that the
initial conformance broker duplicated the production capability/resource path.
Selection was held until both protocols entered one executor kernel for SES
compartment construction, source and lifecycle evaluation, exact-grant checks,
per-invocation resource charging, async capability-task drain, opaque handles,
and cleanup. Real-browser audit messages establish 32 conformance entries and
all ten production-integration entries through that shared kernel. Additional
counterexamples cover mutable execution input during termination,
fire-and-forget ungranted calls, fire-and-forget budget exhaustion, and total
private-state bytes across distinct state entries.

Ticket 08's resource accounting is intentionally scoped to one bounded
`realm.execute` invocation. The capability host remains the trusted owner of
objects, schedules, subscriptions, and other side effects already issued
outside the Worker. Realm-lifetime accumulation, cancellation of issued host
side effects, and disposal of those host-owned resources belong to Ticket 09's
host-controlled Generated Mechanic Lifecycle; this evaluation does not claim
that work as completed.

Per the ticket's stop-at-first-pass rule, QuickJS/Wasm, the iframe-inner-realm
alternative, and the plain Worker baseline were not promoted to executable
comparison after SES passed every hard gate. Their research remains here as
replacement guidance, not as ergonomic or performance ranking.

## Replacement-evaluation triggers

Do not reopen the candidate comparison merely to produce a four-way ranking.
Re-evaluate QuickJS/Wasm in a dedicated Worker when at least one of these
concrete requirements or counterexamples appears:

1. Sparkline requires an enforceable per-realm heap limit or engine-level
   instruction interruption rather than Worker termination as the only hard
   backstop.
2. The production Content Security Policy or deployment topology cannot permit
   the evaluator behavior required by SES without weakening the whole-game
   runtime policy.
3. The threat model expands to mutually distrustful tenants or another
   isolation boundary materially stronger than the current generated-mechanic
   model.
4. Production measurements show unacceptable Worker termination latency,
   memory overshoot, or recovery behavior against the runtime's availability
   targets.

If a trigger occurs, evaluate QuickJS/Wasm first through the same unchanged
real-browser conformance gates and production adapter contract. The plain
Worker remains a hard-rejection baseline unless it gains a genuine inner
authority boundary. Reconsider the iframe-plus-inner-realm option only if the
browser platform supplies a dependable hard-interruption boundary or Sparkline
develops a requirement that specifically favors document isolation. Until
then, preserve the replaceable adapter and continue with the selected SES
Worker architecture.

## Evaluation boundary

The shortlist is evaluated only as four concrete browser architectures:

1. SES `Compartment` after `lockdown()` inside a dedicated Web Worker.
2. QuickJS compiled to WebAssembly inside a dedicated Web Worker, using the `quickjs-emscripten` family as the concrete browser binding.
3. An opaque-origin `iframe` with exactly `sandbox="allow-scripts"`, containing a trusted wrapper and a separately hardened inner realm for generated code.
4. A plain dedicated Web Worker baseline with no inner SES or embedded interpreter.

The candidate endpoint remains distinct from the whole-game runtime iframe in every architecture. Browser support, ergonomics, bundle size, and performance are not selection criteria until a candidate passes the unchanged 32-probe, ten-hard-gate conformance suite in the real browser.

## Cross-cutting browser facts

- Dedicated Workers have a standards-defined hard-stop operation. `Worker.terminate()` sets the worker's closing flag, discards queued tasks, aborts the currently running script, and empties the dedicated worker's outer message queue. This is materially stronger than cooperative cancellation. [HTML Standard: terminate a worker](https://html.spec.whatwg.org/multipage/workers.html#terminate-a-worker)
- Worker messaging clones values and can transfer designated transferable objects. The structured-clone algorithm rejects callable values and proxies with `DataCloneError`; object capabilities and functions therefore cannot cross a Worker boundary directly. [HTML Standard: `Worker.postMessage`](https://html.spec.whatwg.org/multipage/workers.html#dom-worker-postmessage) and [structured serialization](https://html.spec.whatwg.org/multipage/structured-data.html#structuredserializeinternal)
- Consequently, every Worker candidate needs an RPC bridge. Mechanic-object references must remain opaque, cloneable tokens owned by a trusted map; guest-visible functions must be local wrappers that exchange cloneable request/response records. `SharedArrayBuffer` is not a safe shortcut for synchronous RPC here: SES explicitly warns hosts not to expose it because it creates timing and communication channels. [SES caveats](https://docs.endojs.org/modules/ses.html#caveats)
- The `Worker` constructor is itself exposed in dedicated and shared workers, so nested workers are ambient authority in a plain Worker unless the candidate robustly removes that path. Classic workers also expose `importScripts()`, while module workers support static/dynamic module loading and make `importScripts()` fail. [HTML Standard: `Worker` interface](https://html.spec.whatwg.org/multipage/workers.html#worker) and [module workers](https://html.spec.whatwg.org/multipage/workers.html#module-worker-example)
- A plain Worker global also has network and persistence surfaces. `fetch()` is mixed into `WindowOrWorkerGlobalScope`; `WebSocket` is exposed to `Worker`; IndexedDB is exposed to `WindowOrWorkerGlobalScope`; and the base worker global exposes `location`, `navigator`, and classic-script loading. [Fetch Standard](https://fetch.spec.whatwg.org/#fetch-method), [WebSockets Standard](https://websockets.spec.whatwg.org/#the-websocket-interface), [IndexedDB 3.0](https://w3c.github.io/IndexedDB/#factory-interface), and [HTML Standard: `WorkerGlobalScope`](https://html.spec.whatwg.org/multipage/workers.html#workerglobalscope)
- CSP is part of deployability. `worker-src` controls Worker script URLs. JavaScript `eval()`/`Function()` are gated by `unsafe-eval`, while WebAssembly compilation and instantiation are gated by `wasm-unsafe-eval` or the broader `unsafe-eval`. [CSP Level 3: `worker-src`](https://w3c.github.io/webappsec-csp/#directive-worker-src) and [CSP integration with WebAssembly](https://w3c.github.io/webappsec-csp/#wasm-integration)

## Candidate A: SES Compartment in a dedicated Worker

### Current package and APIs

The current npm package is [`ses` 2.2.0](https://www.npmjs.com/package/ses), published under Apache-2.0. Its documented browser API is:

1. Load `ses` before any untrusted code.
2. Call `lockdown()` once in the Worker realm.
3. Construct `new Compartment({ globals, modules, resolveHook, importHook, ... })`.
4. Execute a strict-mode program with `compartment.evaluate(source)` or load modules through `compartment.import()`/`importNow()`.

`lockdown()` hardens shared intrinsics but deliberately does not erase powerful objects from the initial Worker global. Generated code must therefore run only in a `Compartment`; evaluating it in the Worker's initial realm would expose Worker authority. A compartment has its own global object and receives no host APIs such as `fetch` unless explicitly endowed. [Endo SES README](https://github.com/endojs/endo/blob/master/packages/ses/README.md#lockdown) and [SES `Compartment`](https://docs.endojs.org/modules/ses.html#compartment)

### Authority and evaluation behavior

- After `lockdown()`, shared intrinsics are frozen and the compartment controls its own globals. Endowments must be transitively hardened and reviewed because the host is responsible for any authority they convey. [SES security claims and endowment protection](https://docs.endojs.org/modules/ses.html#security-claims-and-caveats)
- Compartment evaluators—including its `Function`, indirect `eval`, dynamic import, and child `Compartment` constructor—are captured by that compartment's global scope. This is the relevant escape-resistance mechanism; source scans or global deletion are not substitutes. [SES: Compartment plus lockdown](https://docs.endojs.org/modules/ses.html#compartment--lockdown)
- SES must initialize while the original intrinsic `eval` is still present because the shim uses its dynamic scope to implement isolated evaluation. A restrictive Worker CSP that blocks JavaScript eval is therefore a deployment risk that must be tested in the production browser response policy. [Endo `SES_DIRECT_EVAL`](https://github.com/endojs/endo/blob/master/packages/ses/error-codes/SES_DIRECT_EVAL.md)
- Modules are host-controlled. Static maps, `moduleMapHook`, `resolveHook`, asynchronous `importHook`, and synchronous `importNowHook` determine what can load. JavaScript module text normally needs `@endo/module-source`; SES intentionally does not embed that parser, and its compiled module-record representation is shim-specific. Program transforms do not automatically apply to module source; the import hook must transform before creating a `ModuleSource`. [SES modules and hooks](https://docs.endojs.org/modules/ses.html#modules) and [SES compiled modules/transforms](https://docs.endojs.org/modules/ses.html#compiled-modules)

### Termination and resource control

SES explicitly states that a guest can execute indefinitely and allocate arbitrary memory. Compartments share a JavaScript agent, so SES alone does not mitigate availability or memory exhaustion. The dedicated Worker must be the hard deadline and recovery boundary, using `Worker.terminate()` and a fresh Worker for subsequent probes. [SES single-guest caveats](https://docs.endojs.org/modules/ses.html#single-guest-compartment-isolation)

There is no SES heap quota or instruction meter in this API. Ticket 08 must establish empirically whether Worker termination satisfies deadline/overshoot and recovery gates before browser or process memory pressure becomes unacceptable.

### Clone and handle implications

The Compartment and its hardened endowments live inside the Worker. Host-side mechanic objects and functions cannot be endowed across `postMessage`; the adapter needs Worker-local hardened functions that validate guest arguments, translate opaque handle tokens, and perform RPC. Promise-returning capability wrappers are natural; any required synchronous host capability would be an architecture mismatch unless it can be implemented entirely inside the Worker without broadening authority.

### Browser and bundling constraints

SES says it runs in most engines as ESM or a script and can be bundled by Webpack, Browserify, Rollup, and Parcel. Its maintainers caution that bundling can alter the trusted computing base and generally recommend a separately loaded SES script. In a Worker architecture, the equivalent requirement is that the trusted SES bootstrap execute first and remain auditable as a distinct bundle boundary. [SES usage](https://github.com/endojs/endo/blob/master/packages/ses/README.md#usage)

The underlying dedicated Worker API is supported by all current browser engines according to the compatibility data embedded in the HTML Standard. SES itself does not publish a precise browser-version matrix, so target-browser support remains an executable check rather than a paper admission. [HTML Standard: dedicated workers](https://html.spec.whatwg.org/multipage/workers.html#dedicated-workers-and-the-dedicatedworkerglobalscope-interface)

### Conformance-critical risks

- SES has no internal CPU or heap ceiling; all availability guarantees depend on correct Worker ownership and termination.
- Initialization order is security-sensitive: no untrusted or mutable third-party code may run before `lockdown()`.
- Endowment design is part of the trusted computing base and must preserve exact grants and opaque handles.
- Module compilation adds `@endo/module-source` or an equivalent trusted build step and must not accidentally grant network-backed import hooks.
- Browser CSP must permit SES's isolated evaluator without weakening the whole-game runtime policy.

## Candidate B: QuickJS/Wasm in a dedicated Worker

### Current package and engine status

The concrete binding is [`quickjs-emscripten-core` 0.32.0](https://www.npmjs.com/package/quickjs-emscripten-core?activeTab=versions), MIT-licensed and published five months before this check. It supplies JavaScript bindings but no engine binary; one `@jitl/quickjs-*` variant must be installed separately. For a synchronous release-mode browser probe, the exact 0.32.0 package pair is `quickjs-emscripten-core` plus either [`@jitl/quickjs-wasmfile-release-sync`](https://www.npmjs.com/package/@jitl/quickjs-wasmfile-release-sync) for a separately served Wasm asset or [`@jitl/quickjs-singlefile-browser-release-sync`](https://www.npmjs.com/package/@jitl/quickjs-singlefile-browser-release-sync) for Wasm embedded in a browser ES module. The current variants vendor upstream QuickJS `2025-09-13+f1139494`, imported on 2026-02-15. [Official variant catalog](https://github.com/justjake/quickjs-emscripten/blob/main/packages/quickjs-emscripten-core/README.md#available-variants)

Upstream QuickJS is released under MIT and documents ES2025 support. The binding remains pre-1.0, warns that breaking API changes can occur, and states that it has not been security-audited. These are maintenance/security-review facts, not automatic conformance failures. [QuickJS license](https://bellard.org/quickjs/quickjs.html#License) and [`quickjs-emscripten` status](https://github.com/justjake/quickjs-emscripten#status--roadmap)

### Current APIs and authority control

- `newQuickJSWASMModuleFromVariant(variant)` loads the selected engine build; `QuickJS.newRuntime()` and `runtime.newContext()` create an isolated QuickJS heap and global environment.
- `context.evalCode(source, filename?, { type: "module"? })` evaluates source and returns a QuickJS handle/result. A context has its own global object. By default, the binding exposes no host functionality; trusted code explicitly adds values and functions with APIs such as `newFunction()` and `setProp()`. [Official `quickjs-emscripten` usage](https://github.com/justjake/quickjs-emscripten#interfacing-with-the-interpreter) and [exposing APIs](https://github.com/justjake/quickjs-emscripten#exposing-apis)
- The embedded QuickJS realm does not inherit browser `fetch`, DOM, Worker constructors, or storage APIs. Only adapter-created host functions and values enter it. The enclosing browser Worker still has those APIs, so untrusted source must never execute in the Worker bootstrap realm or receive the binding/module-loader objects.
- `runtime.setModuleLoader()` controls ES module resolution and source supply. `evalCode(..., { type: "module" })` yields a handle to module exports or, with top-level await, a promise handle. Async host-backed loading requires the async/Asyncify APIs and adds scheduling/size complexity. [Official module-loader examples](https://github.com/justjake/quickjs-emscripten#runtime) and [module exports](https://github.com/justjake/quickjs-emscripten#ecmascript-module-exports)

Never load untrusted precompiled QuickJS bytecode. Upstream states that bytecode is version-linked and receives no security validation. Guest input should remain source text evaluated by the pinned engine build. [QuickJS script evaluation](https://bellard.org/quickjs/quickjs.html#Script-evaluation)

### Termination and resource control

QuickJS has two layers of interruption:

- `runtime.setMemoryLimit(bytes)` applies a heap limit across contexts in the runtime; `setMaxStackSize(bytes)` caps system stack usage.
- `runtime.setInterruptHandler(callback)` is called regularly during engine execution and can stop computation. Upstream documents the corresponding `JS_SetInterruptHandler()` as the execution-timeout hook. [Binding runtime example](https://github.com/justjake/quickjs-emscripten#runtime) and [QuickJS memory/interrupt APIs](https://bellard.org/quickjs/quickjs.html#Memory-handling)
- The surrounding dedicated Worker supplies an independent hard stop if the engine or binding does not return: `Worker.terminate()` aborts the Worker script.

The probe must test both cooperative engine interruption and Worker-level termination. A host callback exposed to QuickJS executes trusted Worker JavaScript; an interrupt handler cannot make a blocking or buggy host callback safe, so guest-callable bridges must remain bounded and preferably asynchronous.

### Clone and handle implications

QuickJS values are represented by explicit Wasm-heap handles. They are neither browser-structured-clone values nor host object references and must be converted deliberately. The binding requires `.dispose()` for handles, contexts, and runtimes; forgotten handles leak Wasm heap and can make context disposal throw. [Official memory-management guide](https://github.com/justjake/quickjs-emscripten#memory-management)

The adapter therefore needs two separate ownership layers:

1. QuickJS handles, always scoped and disposed inside the Worker.
2. Mechanic-object opaque tokens, cloneable over Worker messages and resolved only by the trusted runtime host.

Host functions exposed with `newFunction()` can marshal only validated values. Promise jobs do not run automatically; the adapter must schedule `runtime.executePendingJobs()` and avoid host/guest promise deadlocks. [Official promise scheduling notes](https://github.com/justjake/quickjs-emscripten#promises)

### Browser and bundling constraints

The project explicitly supports browsers. The core package selects environment-specific variants through package export conditions. Browser choices include a separate `.wasm` asset (better caching, smaller JavaScript bundle) or a browser single-file ES module with Wasm embedded (simpler deployment). The umbrella package currently contains four engine variants and documents roughly 9.04 MB installed; the minimal core plus one release-sync variant is documented at about 1.3 MB installed. [Official packaging guide](https://github.com/justjake/quickjs-emscripten#reducing-package-size) and [variant loading](https://github.com/justjake/quickjs-emscripten/blob/main/packages/quickjs-emscripten-core/README.md#environment-specific-variants)

Separate-Wasm variants rely on locating/fetching the asset, commonly through `new URL(..., import.meta.url)`; bundler or deployment rewriting may require a custom variant loader. Any CSP must allow the Worker script and WebAssembly compilation (`wasm-unsafe-eval` or broader `unsafe-eval`). [Official WebAssembly-loading guide](https://github.com/justjake/quickjs-emscripten#webassembly-loading) and [CSP Level 3](https://w3c.github.io/webappsec-csp/#wasm-integration)

The synchronous release variant is the smallest/fastest architecture to probe first. Asyncify is only required if QuickJS must synchronously suspend into asynchronous host functions; the official catalog reports about 2x size and about 40% of sync-variant speed. That is an integration constraint, not a pre-conformance performance comparison. [Variant catalog](https://github.com/justjake/quickjs-emscripten/blob/main/packages/quickjs-emscripten-core/README.md#available-variants)

### Conformance-critical risks

- The browser binding is pre-1.0 and explicitly unaudited.
- Wasm asset resolution and CSP are additional real-browser failure surfaces.
- Manual handle disposal, pending-job scheduling, and two-layer identity ownership increase cleanup/recovery risk.
- Guest-to-runtime capabilities cross two boundaries—QuickJS handle conversion and Worker structured clone—so exact grants and deterministic errors need explicit adapter tests.
- Engine limits must be verified against all pathological probes; Worker termination remains the backstop.

## Candidate C: opaque-origin sandboxed iframe plus hardened inner realm

### Platform status and browser support

This candidate uses the browser platform rather than a new execution-engine package. The HTML Standard defines `iframe sandbox`; without `allow-same-origin`, content is forced into a unique opaque origin. `allow-scripts` re-enables scripts while forms, popups, top navigation, same-origin access, and the other sandboxed capabilities remain disabled. The compatibility data embedded in the standard reports sandbox support in all current engines. [HTML Standard: `iframe sandbox`](https://html.spec.whatwg.org/multipage/iframe-embed-object.html#attr-iframe-sandbox)

There is no third-party license for the iframe primitive. The chosen inner hardener carries its own package status and license; if SES is used, Candidate A's SES package and evaluator constraints still apply inside the frame.

### Authority and evaluation behavior

The sandboxed document is not itself a sufficient Mechanic Execution Realm. It still has a `Window`, DOM, network-capable web APIs, and script evaluators. Generated source must execute only in a separately hardened inner environment whose globals contain the exact grant. The iframe's trusted outer wrapper owns browser-session messages and must never expose `window`, `document`, `parent`, `top`, `fetch`, storage, or module-loading authority to the inner guest.

The sandbox token set must remain exactly `allow-scripts` from pre-load preparation onward. The HTML Standard warns that combining `allow-scripts` and `allow-same-origin` for same-origin content lets the embedded page remove its sandbox and reload outside it; sandbox token changes only affect a subsequent navigation, which is why mutation history and loaded-document identity matter. [HTML Standard sandbox warning and navigation semantics](https://html.spec.whatwg.org/multipage/iframe-embed-object.html#attr-iframe-sandbox)

Native scripts or modules loaded directly into the iframe run with the outer `Window` authority, so they are suitable only for the trusted bootstrap. Generated program/module evaluation and resolution belong to the inner hardener. If that hardener uses dynamic JavaScript evaluation, the iframe response's CSP must allow it without relaxing the whole-game iframe's policy.

### Termination and resource control

Removing an iframe destroys its child navigable without firing unload events. However, the platform exposes no iframe method equivalent to `Worker.terminate()` whose normative algorithm explicitly aborts the currently running script. [HTML Standard: iframe removing steps](https://html.spec.whatwg.org/multipage/iframe-embed-object.html#the-iframe-element)

The HTML event-loop model performs the current task's steps before selecting the next task. Browser process/agent scheduling may allow a parent to remove a busy cross-origin frame, but the standard does not provide a per-iframe CPU deadline or heap quota. Hard-stop latency, heartbeat continuity, memory overshoot, and clean recovery must therefore be established empirically in the real browser rather than inferred from sandboxing. [HTML Standard: event-loop processing model](https://html.spec.whatwg.org/multipage/webappapis.html#event-loop-processing-model)

### Clone and handle implications

Communication with the parent/whole-game runtime uses `postMessage`, so functions and object references still cannot cross the boundary. Exact-source `MessageEvent` checks, opaque origin `null`, nonces, and cloneable opaque handle tokens remain necessary. The inner hardener can receive local hardened wrapper functions from the iframe's trusted outer wrapper, but those wrappers must perform validated message RPC for any whole-game operation.

### Browser and bundling constraints

- The trusted bootstrap can be a separately served document or carefully constructed `srcdoc`; it must be prepared before connection and load with exactly `allow-scripts`.
- A `srcdoc` or opaque-origin resource can inherit CSP constraints from its creator depending on how it is loaded, so the production response topology must be tested, not assumed.
- No extra engine payload is required beyond the inner hardener, but every candidate frame adds a document/browsing-context lifecycle and message endpoint.
- Removing the frame is cleanup, not proof that synchronous hostile execution was interrupted within deadline; this distinction is a hard conformance question.

### Conformance-critical risks

- No standards-defined hard interruption or memory quota comparable to a dedicated Worker plus engine limits.
- The outer iframe has broad browser authority; any inner-realm escape becomes a browser-authority escape.
- Pre-load sandbox preparation, exact loaded-document identity, mutation history, replacement, and disposal are security-critical lifecycle state.
- CSP and trusted-bootstrap delivery can be more complex than the platform-only label suggests.

## Candidate D: plain dedicated Worker baseline

### Platform status and browser support

This candidate uses only the standardized `Worker` API. Dedicated Workers, `postMessage`, and `terminate()` are reported as supported in all current browser engines in the compatibility data embedded in the HTML Standard. Classic and module workers are both standardized; a module worker is created with `new Worker(url, { type: "module" })`. [HTML Standard: Worker interface](https://html.spec.whatwg.org/multipage/workers.html#worker) and [module worker example](https://html.spec.whatwg.org/multipage/workers.html#module-worker-example)

There is no third-party package license. Browser bundling still requires a deployable same-origin Worker URL (or CSP-permitted `blob:` URL), and `worker-src` controls admission. Module workers use the module graph; classic workers expose `importScripts()`. [HTML Standard: Worker construction](https://html.spec.whatwg.org/multipage/workers.html#dom-worker-worker) and [CSP `worker-src`](https://w3c.github.io/webappsec-csp/#directive-worker-src)

### Authority and evaluation behavior

A Worker removes direct DOM and `Window` access but is not least-authority by default. The Worker global exposes `self`, `location`, `navigator`, classic script loading, networking, storage, and nested Worker construction. A bootstrap can attempt to delete or shadow individual globals, but the plain baseline has no SES-style hardened intrinsics/compartment boundary and no separate interpreter global. Exact authority denial must be demonstrated against the adversarial suite; feature deletion or source scanning is not sufficient evidence.

There are two ways to run guest source, each with a hard risk:

- Evaluate source with `eval`/`Function`, which is governed by CSP `unsafe-eval` and runs in the Worker realm with whatever globals remain reachable.
- Bake guest source into a generated Worker script URL, which avoids runtime eval but begins execution at Worker-global authority and complicates a fixed trusted bootstrap/module graph.

Module workers improve deterministic module loading (`importScripts()` fails) but do not remove `fetch`, `WebSocket`, IndexedDB, nested Worker creation, timing sources, or mutable intrinsics.

### Termination and resource control

The baseline's strongest property is `Worker.terminate()`, which aborts a running script and discards pending work. The browser exposes no per-Worker JavaScript heap quota or instruction meter. Deadline/recovery can use termination, but memory overshoot can only be observed and bounded by terminating the whole Worker before browser/process pressure violates policy.

### Clone and handle implications

As with the other Worker candidates, all runtime capabilities require message RPC and cloneable opaque tokens. Because the guest itself occupies the Worker global, any guest access to `postMessage`, `MessagePort`, nested Worker construction, or bootstrap bridge state is a direct authority/forgery risk. The trusted endpoint wrapper must retain private protocol identities and expose only the intended mechanic-call façade—something the plain realm has no built-in mechanism to enforce.

### Conformance-critical risks

- High likelihood of forbidden ambient authority through network, storage, timing, script loading, nested Workers, or bootstrap state.
- No intrinsic hardening or separate global means deletion/shadowing must withstand reflective escape probes.
- No heap limit; Worker termination is the only resource backstop.
- Eval and generated Worker URLs each impose CSP/bundling tradeoffs without solving global authority.

## Risk matrix for executable evaluation

These labels estimate where a hard-gate counterexample is most likely; they do not rank ergonomics or choose a candidate.

| Candidate | Exact global/authority gate | CPU interruption | Memory bounding | RPC/opaque-handle risk | Browser bundle/CSP risk | Source/maturity risk |
| --- | --- | --- | --- | --- | --- | --- |
| SES Compartment + Worker | Medium: strong explicit model, but bootstrap/endowments are TCB | Low–Medium: hard Worker kill; SES has no meter | High: no SES quota; termination only | Medium: Worker RPC plus hardened local wrappers | Medium: eval and trusted bootstrap/bundle order | Medium: current 2.2.0, Apache-2.0, prior audits documented |
| QuickJS/Wasm + Worker | Low–Medium: separate engine exposes nothing by default | Low: engine interrupt plus Worker kill | Low–Medium: QuickJS heap/stack limits plus Worker kill | High: Wasm handles, disposal, jobs, and Worker RPC | High: Wasm asset/variant loading and CSP | Medium–High: current 0.32.0, MIT, pre-1.0 and explicitly unaudited |
| Opaque iframe + hardened inner realm | Medium: inner hardener can be narrow; outer Window is powerful | High: no iframe `terminate()` equivalent | High: no per-frame quota | Medium: iframe RPC plus inner wrappers | Medium: pre-load sandbox and iframe/inner-evaluator CSP | Depends on inner hardener; iframe platform itself is mature |
| Plain dedicated Worker | Critical: many ambient browser authorities and no inner boundary | Low: standards-defined Worker kill | High: no heap quota | High: guest shares Worker realm with endpoint bootstrap | Low–Medium: standard Worker URL/CSP, eval if used | Low package risk; high architectural security risk |

## Probe-facing conclusions

The research supports four candidate-specific hypotheses for Ticket 08's unchanged conformance run:

1. **SES/Worker:** authority probes should target pre-lockdown code, mutable or authority-bearing endowments, child compartments, dynamic imports, and evaluator escape; resource probes must prove Worker termination and fresh-worker recovery because SES itself offers no quota.
2. **QuickJS/Worker:** probes should target accidental exposure of binding/runtime objects, module-loader widening, host-callback reentrancy, Wasm handle leaks, pending-job cleanup, interrupt-handler bypass, memory-limit recovery, and Worker backstop termination.
3. **Opaque iframe/inner realm:** probes should target outer-Window escape, exact sandbox history/identity, navigation/replacement, popup/same-origin laundering, evaluator CSP, and—most importantly—whether hostile synchronous code can actually be interrupted and recovered within the fixed deadline.
4. **Plain Worker:** probes should directly exercise `fetch`, `WebSocket`, IndexedDB, `importScripts`, nested `Worker`, timing, reflection, bridge-state access, eval/Function escape, and post-termination cleanup. A `PASS` requires the candidate to reject these through actual confinement, not by self-reporting its environment.

No primary source establishes conformance for any candidate. Only Ticket 07's unchanged real-browser suite can admit one.
