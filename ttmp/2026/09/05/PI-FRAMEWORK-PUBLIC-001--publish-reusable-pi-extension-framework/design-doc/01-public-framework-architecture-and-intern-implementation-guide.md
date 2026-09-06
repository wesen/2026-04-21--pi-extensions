---
Title: Public framework architecture and intern implementation guide
Ticket: PI-FRAMEWORK-PUBLIC-001
Status: active
Topics:
    - pi-extensions
    - tooling
    - documentation
    - tui
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://extensions/_shared/dashboard/config.ts
      Note: Config paths merge semantics and validation gaps
    - Path: repo://extensions/_shared/dashboard/manager.ts
      Note: Dashboard ownership async rendering and unimplemented options
    - Path: repo://extensions/_shared/registry.ts
      Note: Contribution contracts and global registry extraction
    - Path: repo://extensions/_shared/ui/settings-view.ts
      Note: Actual generic editor support and apply lifecycle
    - Path: repo://extensions/command-palette/index.ts
      Note: Shortcut lifecycle buffering and unsafe command-context casts
    - Path: repo://extensions/launcher/index.ts
      Note: Orchestration outside the shared directory and cwd-relative doc loading
    - Path: repo://package.json
      Note: Private workspace packaging baseline
ExternalSources: []
Summary: Evidence-backed architecture, public package design, migration plan, and release gates for the workspace's shared Pi extension framework.
LastUpdated: 2026-09-05T17:15:00-04:00
WhatFor: Enable an intern to extract and publish a reusable framework without copying workspace assumptions or overstating existing capabilities.
WhenToUse: Before implementing the public framework packages or migrating their consumers.
---


# Public framework architecture and intern implementation guide

## 1. Executive summary

The framework in this repository is a contribution system layered on top of Pi. An extension describes its actions, documentation, settings, dashboard widgets, and keyboard-palette entries. Shared interfaces collect those descriptions; a launcher and palette turn them into discoverable user interfaces. Pi still owns extension loading, commands, tools, lifecycle events, and terminal rendering. This framework is not a replacement for Pi's extension API.

Publish the reusable library separately from its optional user-interface host. This guide uses **`@wesen/pi-extension-framework`** for the library and **`@wesen/pi-extension-shell`** for the installable Pi package. These are proposed names, not reserved npm names or packages created by this investigation. The library provides contribution types, registry access, reusable views, dashboard services, and orchestration. The shell loads those services into Pi and registers `/px`, `/palette`, and the palette shortcut once.

The central delivery criterion is not “npm publish succeeds.” It is: **two independently packaged extensions, installed outside this repository, appear in the same shell, open their own shipped docs, apply their own settings, and survive reload without stale callbacks or duplicate terminal listeners.** Test packed tarballs in a clean project; a symlink inside this workspace is not enough.

This ticket delivers analysis and an implementation specification. It does not implement, publish, or install the proposed packages. All design decisions below are proposed. npm ownership, license approval, runtime-scoping verification, and supported Pi versions remain release gates.

### Evidence baseline

- Repository revision: `9c3c1f3c9eb210bd8a74eb0c2218845d49feee26`.
- Investigation date: 2026-09-05.
- Local runtime inspected: Node `v24.18.0`, installed Pi `0.85.0` under `@earendil-works/pi-coding-agent`.
- Source corpus: all eleven `_shared` TypeScript files, launcher and command-palette entrypoints, representative consumer registration blocks, project settings, and local framework/testing guides.
- Shared code is 1,985 lines; the two host entrypoints add 635 lines. Nineteen consumer TypeScript files reference `../_shared/`.
- Five small contract probes passed against current code. They confirm both useful behavior and defects; they are not tests of the proposed package or a full Pi loader integration.

## 2. Start here: concepts and responsibilities

An **extension factory** is a default-exported function receiving Pi's `ExtensionAPI`. Pi executes the factory during loading. The factory registers commands and lifecycle hooks; it should not start long-lived timers or subprocesses merely because the module was imported. Session-owned resources start in `session_start` and stop in `session_shutdown`.

A **contribution** is a JavaScript object containing metadata and callbacks. It is not JSON: callbacks capture live extension state. For example, the agent-env widget closes over an injection counter. Putting that contribution into the registry does not copy or persist the counter. It makes the callback discoverable.

A **registry** is the in-memory catalog. It answers “which extensions are loaded?” It does not scan npm, install extensions, register Pi tools, or persist extension business state. The current catalog sits on `globalThis` and is shared by module copies in the same JavaScript realm.

A **host**, called the shell in this proposal, connects those contributions to user actions. It registers actual slash commands, opens overlays, invokes callbacks, handles errors, and refreshes ambient displays. A library import must not secretly install this host.

A **TUI component** renders terminal rows. There is no browser DOM or React reconciliation here:

```text
state + available width -> render(width) -> string[]
keyboard input -> handleInput(data) -> update state
                                    -> invalidate()
                                    -> requestRender()
```

Each returned row must fit the supplied width in terminal display cells. ANSI escapes occupy bytes but usually no display cells; some Unicode characters occupy two cells. Use `visibleWidth`, `truncateToWidth`, and `wrapTextWithAnsi`, not JavaScript string length, for layout.

A **Pi package** and an **npm library** are different roles. npm's `exports` tells JavaScript where imports resolve. The package's `pi.extensions` tells Pi which extension factories to load. An extension depending on a library does not automatically cause the library to register `/px`.

### Responsibility table

| Layer | Owns | Does not own |
| --- | --- | --- |
| Pi | Loading, trusted-project policy, events, commands, tools, UI runtime | This framework's contribution semantics |
| Framework core | Types, registration, lookup, lifecycle ownership | Domain actions, npm installation |
| Framework UI/services | Views, invocation policy, dashboard composition | Extension-specific persistence |
| Shell | Commands, shortcut listener, session-level UI installation | Consumer business logic |
| Consumer extension | State, tools, action implementations, config writes | Shared launcher rendering |

## 3. Current architecture: follow the actual code

```text
.pi/settings.json --explicit paths--> Pi extension factories
                                           |
        +----------------------------------+--------------------+
        |                                  |                    |
 agent-env/index.ts              pinned-skills/index.ts     other extensions
        |                                  |                    |
        +----------- registerPiExtension({...}) ----------------+
                                           |
                     globalThis[Symbol.for(...v1)]
                     Map<extensionId, registration>
                           /                 \
           launcher/index.ts         command-palette/index.ts
              /px command             /palette + terminal input
                   |                          |
              shared UI components and dashboard services
                   |
         ctx.ui.custom / setWidget / setStatus
                   |
                Pi TUI
```

### 3.1 Registration and identity

`extensions/_shared/registry.ts:189-252` defines the registration and eight exported functions. The key is `Symbol.for("wesen.pi.extensions.registry.v1")` at line 208. `registerPiExtension` performs `Map.set(id, registration)`; registering an existing ID silently overwrites it. `listPiExtensions` returns a new sorted array, but its elements are the original mutable registration objects.

This global key is important for publication. npm may install separate copies of a library under independent extensions. A module-local `new Map()` in each copy would split discovery. The current symbol solves the same-realm module-copy problem, as the ticket probe demonstrates. It does not solve multiple sessions in one process, different JavaScript realms, removed-extension cleanup, or incompatible schema versions.

`unregisterPiExtension` and `clearPiExtensionRegistry` exist, but a repository search found no consumer invocations. Consequently, stale-entry retention after extension removal is a source-backed risk, not an observed interactive failure in this investigation. Re-registering the same ID replaces it; removing an extension need not touch its old global entry.

Widget keys concatenate extension and widget IDs with a dot (`registry.ts:240`). Without ID restrictions, `a.b` + `c` and `a` + `b.c` collide. The probe confirms this. Treat IDs as persistence keys, not display text.

### 3.2 Actions and launcher orchestration

`extensions/launcher/index.ts:96-278` contains much of the framework behavior even though it is not under `_shared`. Moving only `_shared` would leave documentation loading, default-action selection, action context construction, and settings orchestration behind.

Current default selection is deterministic:

```text
extension.run exists? ------yes----> run it
         | no
first action marked default? --yes-> run it
         | no
exactly one action? --------yes----> run it
         | no
any actions? ---------------yes----> open action picker
         | no
notify that extension was selected
```

After a launcher action, the host awaits `refreshDashboard`. The action receives `PiExtensionActionContext`, containing its extension/action, `openDocs`, `openSettings`, and a fire-and-forget dashboard refresh method. `commands` is display metadata; it does not call `pi.registerCommand`.

The `dangerous` flag exists in the type (`registry.ts:25`) but is not checked in the launcher invocation path. It is not a confirmation guarantee. The action picker displays a fixed first ten actions while its cursor can advance farther (`ui/action-picker.ts:80-87`); a long action list can select an offscreen item.

The launcher component returns a discriminated result, such as `{kind: "docs", extension, state}`. The host closes the current modal, opens the requested modal, then constructs a new launcher with saved query and scroll state. This separation is useful and should survive extraction. Do not make view classes call domain actions directly.

### 3.3 Documentation loading

`launcher/index.ts:240-245` uses this precedence: `load(ctx)`, then `markdown`, then `fs.readFileSync(doc.path)`, then placeholder text. A relative path is interpreted by Node against the process working directory, not the package root and not explicitly `ctx.cwd`.

The repository convention of relative doc paths prevents hardcoded personal directories, but it does not make paths package-relative. A README shipped under an npm package will not normally be found under a user's unrelated project directory. This must be corrected before calling the framework portable.

The launcher opens the requested doc ID or the first doc; it does not currently provide a general multi-document picker. The `DocViewer` (`ui/doc-viewer.ts:42-58`) styles a small Markdown subset: two heading levels and bullet lines, then wraps text. It is not a complete Markdown renderer with navigable links, fenced-code highlighting, or table layout.

### 3.4 Schema and custom settings

`registry.ts:39-117` declares values, fields, sections, schema versions, validation, change/apply/cancel callbacks, and custom component factories. `ui/settings-view.ts` turns a schema into a `SettingsList` and keeps a shallow draft object.

Actual generic editor behavior is narrower than the declared schema:

- Booleans cycle between true and false.
- Selects cycle option values; option labels are not used for the value display.
- Numbers enumerate up to thirty choices from min/max/step.
- Strings and paths have only a default-value choice, not a free-text editor or file picker.
- Multiselects cycle single option strings and parse comma-separated output; they are not a checklist.
- `required`, `advanced`, and `secret` are not enforced by the generic view.
- Defaults are used for display but are not necessarily materialized into the draft passed to `onApply`.
- `onChange` and `onCancel` are invoked without awaiting/catching their promises. Apply has no busy guard against repeated Ctrl+S.

A custom settings factory receives `{ctx, tui, theme, done, requestRender}` and returns a component. The launcher owns `ctx.ui.custom`; this keeps lifecycle ownership clear. Pinned-skills is the representative custom consumer (`extensions/pinned-skills/index.ts:202-226`). Agent-env demonstrates a small boolean schema (`extensions/agent-env/index.ts:176-181`).

### 3.5 Dashboard configuration and rendering

`dashboard/config.ts:38-73` reads defaults, `~/.pi/agent/dashboard.json`, and `<cwd>/.pi/dashboard.json`, in that order. Zones merge by name. Items merge by widget key, with later fields overriding earlier fields. Project writes serialize directly to the project file; there is no atomic rename or full nested validation.

A missing or syntactically invalid file falls back silently. The top-level check is weak: `typeof null === "object"`, so `zones: null` can pass the reader and fail later during merge. A public package needs structured diagnostics and validation, not a type assertion over parsed JSON.

`dashboard/manager.ts:71-94` selects widgets for a zone, resolves item settings, and awaits each widget sequentially. The dashboard overlay includes all registered widgets unless explicitly hidden there. A widget placed in the status bar can also appear in the overlay; this is current behavior, not duplication caused by the new design.

```text
defaults + global file + project file
                 |
           merged zone config
                 |
registry widgets -> zone selection -> visibility + variant
                 |
           await widget.render(...)
                 |
      string / string[] / Component
                 |
     inline, stack, or grid renderer
                 |
             Pi UI surface
```

Do not mistake the types for an implemented layout engine:

- Status rendering uses a fixed width of 100 and an inline formatter.
- Above/below editor components always stack; overlay rendering always uses grid.
- Configured `layout` does not dispatch these renderers dynamically.
- Widget `refresh` policies are declared but not scheduled.
- `defaultVisible`, `minWidth`, and `maxWidth` are not honored by zone selection.
- `extensionDetails` is a declared zone, not a mounted dashboard surface in the launcher.
- Layout `row`, `column`, and `height` are not a general placement engine.
- Rendered components are flattened to lines. Input and component disposal are not forwarded by this code.

Both `DashboardZoneComponent` and `DashboardOverlay` start promises inside synchronous `render` and cache results. Rejections are not caught, and there is no disposed/generation check before caching a late result. These are release-blocking lifecycle risks for a reusable asynchronous renderer.

### 3.6 Palette: two paths, one concept

Palette contributions are hierarchical trees (`registry.ts:158-187`). `buildRootPaletteItems` groups entries by extension, giving each extension one root submenu. Root keys derive from extension names; child keys use explicit overrides, then title characters, then a-z/0-9 fallback.

`assignKeys` throws for duplicate explicit keys, can reorder items because assignment occurs in passes, and omits unkeyable items after exhaustion. The probe shows 37 identical-title entries yielding only 36 entries. In the overlay's input handler, key activation precedes appending search text even when search is active (`ui/command-palette.ts:117-131`). That can execute an item while a user is trying to type a filter. Fix and test this before public release.

There are two launch paths: launcher `p` uses a short local routine; the standalone extension has a much more defensive controller (`command-palette/index.ts:100-228`). It intercepts terminal input, schedules opening with `setImmediate`, buffers early keys, focuses the overlay, replays safe inputs, and forces redraws. Preserve the reason for this state machine: fast typing can arrive between opening the overlay and acquiring focus.

The standalone shortcut path casts `ExtensionContext` to `ExtensionCommandContext`. A TypeScript cast does not manufacture command-only methods. Public callbacks must not be promised command capabilities when launched from raw terminal input.

### 3.7 Dependency and documentation drift

The root `package.json` is private, has no build/test scripts or exports, and only depends on `yaml`. The framework itself imports Node built-ins and Pi packages; it does not use YAML. Do not carry the workspace's YAML dependency into the extracted framework without a real import requiring it.

Workspace code imports `@mariozechner/pi-*`. Installed Pi 0.85.0 docs use `@earendil-works/pi-*`. Its installed loader explicitly aliases both namespaces (`dist/core/extensions/loader.js:39-55,92-105`). That explains why local loading can work despite old names. It is not evidence that native Node imports or a separately compiled consumer can resolve the old names. Choose a host baseline and compile against its real packages.

The local testing guide also contains stale interaction instructions. Current launcher search includes IDs, actions, docs, and nested palette items, not just names. Submit `/px` with Enter before typing overlay keys; enter search with `/`, type the query, press Enter to leave search, then press `s` or `a`. The source takes precedence over stale walkthroughs.

## 4. Goals, non-goals, and release scope

### Goals

1. Import contributions from a public package rather than relative workspace internals.
2. Install the shell independently through Pi's npm-package support.
3. Discover contributions across independent dependency roots in one Pi runtime.
4. Resolve shipped docs independently of the user's working directory.
5. Define lifecycle, callback contexts, error handling, and supported UI modes.
6. Preserve existing extension IDs, commands, widget keys, and dashboard file locations where possible.
7. Provide generated declarations, runnable examples, artifact tests, and an operational release checklist.

### Non-goals

- Publishing every extension in this repository in the same release.
- Moving prompto plugins, compaction logic, printer integrations, or external executables into the framework.
- Building a general reactive UI framework, dependency-injection platform, or arbitrary dashboard grid engine.
- Sandboxing third-party extensions; Pi extensions execute with the user's permissions.
- Claiming all historic Pi versions or concurrent multi-session SDK embeddings work without tests.

### v0.1 product boundary

Support actions, explicit palette leaves/submenus, inline/lazy/file docs, custom settings, and a truthful generic settings subset. Support text dashboard widgets with manual refresh and four mounted zones. Defer richer refresh schedules, interactive widget components, arbitrary placement, and full generic path/multiselect editors. Either omit deferred types from the initial public contract or clearly reject them; silently ignoring them is not acceptable.

This is a deliberate public-API tightening, not a compatibility shim. The local registry has never been a versioned public npm API. Migrate local consumers explicitly; preserve persisted identity separately from preserving every TypeScript field.

## 5. Proposed package boundaries and dependency direction

Initially develop both packages under this repository's `packages/` directory. That makes source review and migration atomic without committing to a new GitHub repository before ownership is decided. Publish independent npm artifacts. A later repository move does not change consumers' imports.

```text
packages/
  pi-extension-framework/
    package.json
    tsconfig.json
    README.md
    LICENSE                    # only after owner approval
    src/
      index.ts                 # contribution types + registry facade
      contracts.ts
      registry.ts
      docs.ts
      host.ts                  # shared orchestration, no auto-install
      dashboard/
        index.ts
        config.ts
        controller.ts
        layout.ts
      ui/
        index.ts
        action-picker.ts
        command-palette.ts
        dashboard-overlay.ts
        doc-viewer.ts
        extension-launcher.ts
        settings-view.ts
        palette-keys.ts
    test/
    examples/
    dist/                      # build output, included in npm artifact
  pi-extension-shell/
    package.json
    README.md
    src/extension.ts           # sole Pi-discovered factory
    dist/extension.js
```

```text
consumer extension -----imports----> framework root
        |                             /docs, /ui, /dashboard
        | pi lifecycle                       ^
        v                                    |
       Pi <----shell extension----------framework /host

Forbidden direction: framework -> this workspace's consumers
Forbidden side effect: importing framework -> registering /px
```

The shell is installed once by the user. Consumer packages list the library in ordinary `dependencies`. They must not list shell extension resources in their own `pi.extensions`, which would multiply commands and terminal listeners. Pi documentation distinguishes ordinary dependency libraries from packages whose extension resources are deliberately bundled; our consumer path is the ordinary-library case.

### Proposed library manifest sketch

This is a template, not publish-ready metadata. Fill in repository, author, license, supported Node engine, and an approved scope before release.

```json
{
  "name": "@wesen/pi-extension-framework",
  "version": "0.1.0",
  "type": "module",
  "files": ["dist", "README.md", "LICENSE"],
  "exports": {
    ".": {"types": "./dist/index.d.ts", "import": "./dist/index.js"},
    "./docs": {"types": "./dist/docs.d.ts", "import": "./dist/docs.js"},
    "./ui": {"types": "./dist/ui/index.d.ts", "import": "./dist/ui/index.js"},
    "./dashboard": {"types": "./dist/dashboard/index.d.ts", "import": "./dist/dashboard/index.js"},
    "./host": {"types": "./dist/host.d.ts", "import": "./dist/host.js"}
  },
  "peerDependencies": {
    "@earendil-works/pi-coding-agent": "*",
    "@earendil-works/pi-tui": "*"
  },
  "publishConfig": {"access": "public"}
}
```

Use unbundled ESM plus `.d.ts` files and source maps. With TypeScript NodeNext, write `.js` suffixes for relative source imports so emitted JavaScript resolves natively. Keep Pi packages external; install the exact tested versions as development dependencies for compilation and CI. The `*` peer ranges follow the inspected Pi package guidance but are **not a promise of universal compatibility**. Publish a tested-host matrix and fail the host's capability checks with an actionable diagnostic when necessary. Narrow peer ranges if install tests show that is preferable; record that decision rather than guessing a minimum version.

Do not set `sideEffects: false` until module initialization has been audited. Do not use a wildcard deep-import export such as `./*`; it turns every private implementation file into a compatibility promise. The framework package has no `pi` manifest and no conventional `extensions/` directory.

### Proposed shell manifest sketch

```json
{
  "name": "@wesen/pi-extension-shell",
  "version": "0.1.0",
  "type": "module",
  "keywords": ["pi-package"],
  "files": ["dist", "README.md", "LICENSE"],
  "pi": {"extensions": ["./dist/extension.js"]},
  "dependencies": {"@wesen/pi-extension-framework": "0.1.0"},
  "peerDependencies": {"@earendil-works/pi-coding-agent": "*"},
  "publishConfig": {"access": "public"}
}
```

Test the compiled shell under the real Pi loader. Do not assume `tsc` success proves jiti/ESM interoperability or host-provided dependency resolution. Git installations also need built artifacts or a verified build strategy because Pi installs production dependencies; do not depend on development-only TypeScript being available after installation.

## 6. Public API reference and changes

### 6.1 Root API: registration with lifecycle ownership

The proposal adds `pi` to registration. This is an intentional migration from `registerPiExtension(registration)` to `registerPiExtension(pi, registration)`. It gives the registry access to lifecycle hooks and the runtime communication identity, which the current function lacks.

```typescript
// Proposed API, not implemented in this ticket.
export function registerPiExtension(
  pi: ExtensionAPI,
  registration: PiExtensionRegistration,
): RegistrationHandle;

export interface RegistrationHandle {
  readonly id: string;
  dispose(): void; // idempotent; removes only this registration instance
}

export function listPiExtensions(pi: ExtensionAPI): PiExtensionRegistration[];
export function getPiExtension(pi: ExtensionAPI, id: string):
  PiExtensionRegistration | undefined;
export function listPiDashboardWidgets(pi: ExtensionAPI): WidgetContribution[];
export function collectPaletteItems(pi: ExtensionAPI): PaletteContribution[];
export function dashboardWidgetKey(extensionId: string, widgetId: string): string;
```

Keep collection result shapes close to current code: widget entries contain `{extension, widget, key}`; palette entries contain `{extension, item}`. Expose explicit readonly views where practical. Do not serialize callbacks, invoke them during registration, or deep-freeze extension-owned state captured by callbacks.

Do not export global destructive `clear` in the public root. Tests should construct isolated stores through a test-only internal factory. Disposal must be ownership-aware: an old handle must not delete a newer registration occupying the same ID.

### 6.2 Shared store and runtime scope

Use a versioned same-realm global store with per-runtime maps. The proposed runtime key is the shared `pi.events` object. **Verifying object identity across extension factories and across reload is Phase 0's gating experiment.** The public event-bus API promises communication; the docs alone do not establish referential identity. Do not merge an implementation whose correctness depends on an untested identity assumption.

```text
globalThis[Symbol.for("wesen.pi.extension-framework.registry.v2")]
  protocol: 2
  runtimes: WeakMap<runtimeIdentity, RuntimeStore>
    RuntimeStore
      registrations: Map<id, {token, contribution}>
      listeners: Set<changeCallback>
      shellOwner?: ownershipToken
```

The v2 suffix distinguishes a changed in-memory protocol from the existing v1 store. It is not the npm version: compatible patch releases must rendezvous at the same protocol key. Validate the shape/version before using an existing store. Incompatible majors must report incompatibility rather than cast unknown objects and proceed.

If `pi.events` identity is not shared within the supported host, stop and revise the design to use an explicit host-scoped event-bus request/response protocol or a documented runtime token. Do not fall back silently to one unscoped process-global map. Separate workers/realms would require messaging and are out of v0.1 scope.

```text
register(pi, contribution):
  validate metadata, IDs, duplicate child IDs, palette shape
  store = storeFor(verifiedRuntimeIdentity(pi))
  token = unique object
  activate():
    if store has a different live owner for contribution.id: throw conflict
    store.set(id, {token, contribution})
    emit catalog-changed
  deactivate():
    if store.get(id).token == token:
      store.delete(id)
      emit catalog-changed
  activate()                 # discovery available after factory runs
  on session_shutdown: deactivate()
  on session_start: activate unless already active or permanently disposed
  return idempotent dispose that deactivates and marks permanently disposed
```

The start hook covers a host retaining factories across session boundaries; ordinary reload may create a fresh factory. Test both rather than clearing the entire catalog on `session_start`, which would erase registrations depending on event order. Subscriptions and state must not retain the previous session context after replacement.

### 6.3 IDs and validation

Preserve current extension IDs and `extension.widget` persistence keys. For the initial public contract require extension/action/widget/doc IDs to be lowercase kebab-case, for example `[a-z0-9]+(?:-[a-z0-9]+)*`. Palette child IDs follow the same rule and are unique within siblings. This prevents dot-key ambiguity without rewriting existing dashboard keys. Audit actual registered IDs before enabling strict validation; migrate exceptions explicitly.

Reject duplicate live extension IDs with both IDs/provenance available in the diagnostic. A display name is not a unique key. Reject palette cycles, excessive nesting, duplicate sibling IDs, and entries containing both nonempty children and `run`. An empty submenu must show an empty state, not disappear or execute unexpectedly.

### 6.4 Action and palette contexts

Ordinary actions should accept `ExtensionContext`, the common capability set available from commands, events, and shortcuts. Preserve optional framework action helpers, but make dashboard refresh awaitable. If an action truly needs session-switching command methods, mark it explicitly as command-only and disable it with an explanation when launched without command context. Never replace this check with `as ExtensionCommandContext`.

```typescript
// Conceptual discriminated contract; compile this in the implementation.
type Action =
  | { id: string; title: string; requires?: "context";
      dangerous?: boolean;
      run(ctx: ExtensionContext, helpers: ActionHelpers): void | Promise<void> }
  | { id: string; title: string; requires: "command";
      dangerous?: boolean;
      run(ctx: ExtensionCommandContext, helpers: ActionHelpers): void | Promise<void> };

interface ActionHelpers {
  openDocs(docId?: string): Promise<void>;
  openSettings(): Promise<void>;
  refreshDashboard(): Promise<void>;
}
```

Carry this distinction through palette leaf execution as well. The host keeps the actual command context from `/px` or `/palette` as an optional capability; raw-terminal opening supplies only the base context. A command-only leaf can remain visible but disabled in shortcut mode. This is a transparent limitation, not a silent loss of behavior.

Unify invocation policy in `/host`: check capability and runtime validity, close the picker, confirm dangerous actions, execute once, catch and report errors with extension/action IDs, then refresh if still in the same live runtime. After a successful session switch or reload, do not refresh using the old `ctx`. A generation invalidated by shutdown provides that guard.

Direct slash commands remain extension-owned and may share a handler, but they do not automatically inherit the framework's confirmation wrapper. Document this boundary; a `dangerous` field is not a security sandbox.

### 6.5 Documentation API

Prefer discriminated sources, retaining `load` for dynamic docs. A helper can hide the path plumbing and maintain relative authoring paths:

```typescript
import { packageDoc } from "@wesen/pi-extension-framework/docs";

const overview = packageDoc({
  id: "overview",
  title: "Overview",
  baseUrl: import.meta.url,
  path: "../README.md",
});
```

For a compiled `dist/index.js` with README at package root, `../README.md` is correct. A source entrypoint under another directory may need a different relative path. The helper resolves against the importing module URL and returns a lazy file loader; it must not resolve against the framework's own module or `process.cwd()`.

Support file URLs only in this helper; do not fetch arbitrary HTTP URLs automatically. Resolve on invocation, report extension/doc/path on failure, and apply a documented size limit. This is portability and resource management, not a sandbox: a trusted extension could read arbitrary files without the helper. For an explicit project doc, resolve a relative path against `ctx.cwd` and label it as project-owned. Never guess between package and project roots.

### 6.6 Settings contract for v0.1

Expose booleans, selects, and bounded finite numeric choices in the generic schema. Keep custom settings for strings, paths, multiselects, and secrets until dedicated editors exist. Audit `busybar-alert/settings.ts` and image-qa's settings-option usage before migration; do not assume the two onboarding examples exhaust consumers.

Materialize defaults into a draft before rendering. Clone array values, validate field IDs across sections, require finite numeric bounds and positive step, and separate draft updates from committed persistence. `onApply` is the commit callback. For v0.1, omit live-effect `onChange` from the generic contract unless rollback semantics are explicitly implemented. Keep cancellation side-effect free, except an optional awaited cleanup hook.

```text
load -> normalize defaults -> edit isolated draft
                           -> cancel: discard + cleanup
                           -> apply:
                                busy guard
                                validate supported field constraints
                                await extension validation
                                if invalid: stay open with field errors
                                await onApply(copy of draft)
                                close on success
                                catch: stay open and display error
                                finally: release busy guard
```

Versioning a schema is the extension's persistence responsibility; the generic UI cannot infer a migration from schema version 1 to 2. The library validates editor input, while extensions validate external files and domain-specific constraints.

### 6.7 Dashboard contract for v0.1

Start with `string | string[]` output and synchronous cheap rendering of extension-maintained snapshots. Asynchronous collection can be retained behind a bounded controller, but do not publish support for arbitrary stateful returned Components until disposal/input ownership is defined. No inspected consumer import requires the current component union itself; still audit render returns before removing it.

Expose `refreshDashboard(ctx): Promise<void>` as the convenience route used by pinned-skills, implemented through the active host/controller rather than mounting a second competing dashboard. If no shell is installed, resolve as a documented no-op; consuming extensions must work without the shell.

Honor `defaultVisible` when no explicit item visibility exists. Retain fixed zone layout semantics for v0.1: status inline, editor zones stack, overlay grid. Reject or warn about unsupported configuration values rather than advertising a configurable arbitrary grid. Preserve existing file locations; offer injected filesystem/path options for tests and future distributions. Prefer Pi's exported config-directory facilities when supporting rebranded hosts, with migration documented rather than silently abandoning `.pi/dashboard.json`.

```text
refresh controller:
  increment revision; capture revision and runtime generation
  collect selected widgets, handling each failure separately
  if closed or generation/revision changed: discard result
  else publish snapshot and request render
shutdown:
  mark closed; increment generation
  clear owned statuses/widgets; cancel timers/listeners
  ignore any non-cooperative late callback results
```

If async render callbacks remain, provide an abort signal, a host-selected timeout, and per-widget error placeholders. Cancellation cannot stop arbitrary user JavaScript, but stale completion must never mutate a new UI. Coalesce refresh requests; do not spawn unbounded redraw work.

## 7. Worked external consumer

This illustrates the proposed API, not a copy-paste example that works with today's local registry. The implementation must turn it into a compiled, tested example before release.

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerPiExtension } from "@wesen/pi-extension-framework";
import { packageDoc } from "@wesen/pi-extension-framework/docs";

export default function counter(pi: ExtensionAPI): void {
  const state = { enabled: true, count: 0 };
  const increment = async (ctx) => {
    if (!state.enabled) return;
    state.count += 1;
    ctx.ui.notify(`Count: ${state.count}`, "info");
  };

  registerPiExtension(pi, {
    id: "counter-demo",
    name: "Counter Demo",
    description: "A portable example contribution.",
    commands: ["counter"],
    actions: [{id: "increment", title: "Increment", default: true,
               run: increment}],
    palette: [{id: "increment", title: "Increment", key: "i",
               run: increment}],
    docs: [packageDoc({id: "overview", title: "Overview",
                       baseUrl: import.meta.url, path: "../README.md"})],
    settings: {
      kind: "schema",
      schema: {version: 1, sections: [{id: "main", title: "Main", fields: [
        {id: "enabled", label: "Enabled", type: "boolean"}
      ]}]},
      load: () => ({enabled: state.enabled}),
      onApply: (values) => { state.enabled = values.enabled === true; }
    },
    widgets: [{id: "status", title: "Counter", defaultZone: "statusBar",
               render: () => `count:${state.count}`}]
  });
  pi.registerCommand("counter", {
    description: "Increment the counter",
    handler: async (_args, ctx) => { await increment(ctx); }
  });
}
```

The counter intentionally keeps state in memory. Restart resets it; packaging does not create persistence. Use Pi session entries or extension config when persistence is required. The shared handler enforces `enabled` for both action and direct-command paths, avoiding the divergence in simplistic tutorial examples.

Consumer setup after publication would be:

```bash
# Extension author, in the consumer package:
npm install @wesen/pi-extension-framework@0.1.0
# Declare its own pi.extensions and include README in its tarball.

# End user, after the packages actually exist:
pi install npm:@wesen/pi-extension-shell@0.1.0
pi install npm:YOUR-CONSUMER-PACKAGE@YOUR-VERSION
```

Do not run these proposed-name install commands during the research ticket. Framework dependency installation and shell Pi-resource installation are separate operations.

## 8. Decision records

### Decision A: separate library and installable shell

- **Context:** Consumers need types/services without duplicate slash commands.
- **Options considered:** One autoloading package; library with an opt-in subpath factory; two packages.
- **Decision:** Two packages, one ordinary library and one Pi host package.
- **Rationale:** Explicit installation ownership and no hidden command registration from imports.
- **Consequences:** Two release artifacts and a small compatibility matrix; install docs must explain both roles.
- **Status:** proposed.

### Decision B: compiled unbundled ESM and explicit exports

- **Context:** Current TypeScript works through Pi's loader, while external consumers need native resolution and types.
- **Options considered:** Source-only TypeScript; bundled JavaScript; unbundled ESM plus declarations.
- **Decision:** Unbundled ESM plus declarations; Pi dependencies external.
- **Rationale:** Inspectable artifacts, ordinary Node import tests, and no embedded second TUI runtime.
- **Consequences:** Build infrastructure, `.js` import suffixes, declaration tests, and real-loader tests are mandatory.
- **Status:** proposed.

### Decision C: lifecycle-aware registration and protocol v2

- **Context:** Existing global map handles duplicate module copies but not runtime ownership or removal.
- **Options considered:** Keep global v1 unchanged; module singleton; lifecycle-aware runtime-scoped store; event-bus discovery.
- **Decision:** Add `pi` to registration and use a versioned, runtime-scoped same-realm store, contingent on identity tests.
- **Rationale:** Local ownership makes disposal safe; per-runtime scope avoids cross-session callback leakage.
- **Consequences:** Explicit consumer migration and no v1/v2 bridge; event-bus identity must be experimentally established first.
- **Status:** proposed.

### Decision D: narrow the first public contract

- **Context:** Existing fields promise editors, refresh policies, and layouts the runtime does not implement.
- **Options considered:** Publish unchanged and document caveats; implement every field; publish only tested functionality.
- **Decision:** Publish a truthful subset plus custom settings escape hatch.
- **Rationale:** An intern can implement and validate bounded behavior; silent unsupported settings are harmful.
- **Consequences:** Audit consumers for removed fields; richer features become future versioned work.
- **Status:** proposed.

### Decision E: module-relative docs, explicit project docs

- **Context:** Relative Node filesystem paths depend on working directory.
- **Options considered:** cwd-relative paths; registration-wide package root; module-relative helper; inline all docs.
- **Decision:** Module-relative lazy file helper, plus explicit project-doc support.
- **Rationale:** Works with package assets and avoids capturing this repository's absolute location.
- **Consequences:** README placement and `npm files` are part of artifact correctness.
- **Status:** proposed.

### Decision F: target the inspected modern Pi namespace first

- **Context:** Source uses old names while the installed 0.85.0 host documents new names and aliases old imports.
- **Options considered:** Old namespace only; runtime dual-import adapters; current namespace with a tested host baseline.
- **Decision:** Use `@earendil-works` in new package source; qualify the supported-host baseline in Phase 0.
- **Rationale:** Do not base a public library on implicit local aliases or speculative backwards compatibility.
- **Consequences:** Older Pi distributions are unsupported until separately tested; avoid bundling alias shims.
- **Status:** proposed.

## 9. Implementation plan: small reviewable phases

Each phase ends with concrete artifacts and checks. Do not combine lifecycle redesign, UI fixes, and publication into one giant move commit. Existing code should remain the behavior reference until a deliberate change is documented.

### Phase 0: decisions and loader experiments

Read `registry.ts`, both host entrypoints, and the installed Pi `packages.md`, `extensions.md`, and `tui.md`. Confirm npm scope access and choose a license with the owner; no LICENSE was found in the inspected repository search. Choose Node/Pi support baselines from actual test runs, not the date of this document.

Create fixture extensions that record, without user content, whether `pi.events` is the same object across independent factories; test two copied dependency roots, `/reload`, `/new`, and a second SDK session if that support is claimed. Observe lifecycle ordering and whether the shell sees all registrations after startup. A negative identity result requires revising Decision C before implementation.

**Artifacts:** compatibility matrix, fixture tests, recorded lifecycle trace, approved metadata. **Gate:** loader identity and callback context behavior understood; publication ownership approved before any registry write.

### Phase 1: package skeleton and build boundary

Create the two package directories, TypeScript NodeNext configs, exact development dependencies, test scripts, and explicit export maps. Add npm workspaces at the private repository root only if it simplifies local package resolution. Keep the root private. Build with declaration and source-map emission; use `prepack` to build so a tarball cannot accidentally ship stale output.

**Files:** package manifests, lockfile, tsconfigs, root workspace wiring, minimal `src/index.ts`, shell factory stub. **Checks:** build, native Node import of every declared export, `npm pack --dry-run --json`, consumer `tsc --noEmit` fixture. Do not install the shell into personal settings for these checks.

### Phase 2: contracts and lifecycle registry

Split existing `registry.ts` into public contracts and store implementation. Add runtime identity validation, ownership tokens, change notifications, ID validation, and registration handles. Port pure registry tests first, then the two-root real-loader fixtures. Keep `dashboardWidgetKey` output stable for valid existing IDs.

**Gate:** independent modules share contributions; independent runtimes do not; old disposal cannot remove new ownership; removed extensions disappear after reload; incompatible protocol shapes produce diagnostics. No command/UI behavior belongs in this phase.

### Phase 3: portable docs and reliable settings

Extract `loadDoc` from launcher into `/docs`. Implement module-relative helpers and error reporting. Add a doc chooser when more than one document is registered; a requested unknown ID should report an error instead of silently substituting the first doc. Keep the simple Markdown renderer initially, but document its subset.

Port the settings view with the reduced schema, materialized defaults, awaitable validation, busy guard, and caught callback errors. Preserve the custom component factory ownership pattern. Compile representative agent-env and pinned-skills contributions against the new contract; create reduced fixtures rather than invoking their domain side effects.

**Gate:** README opens from a directory unrelated to this repo; missing docs fail usefully; apply runs once; cancel preserves original values; unsupported field kinds are rejected.

### Phase 4: dashboard controller and UI correctness

Move config/layout helpers and introduce an owned controller. Validate nested config; diagnose invalid versions; use atomic same-directory temporary write and rename for project config. Reads should not mutate default/global inputs. Preserve unknown widget references so temporarily absent extensions do not lose user preferences. Only honor project overrides where host trust policy permits.

Port views and repair bounded-width rendering, small-height degradation, action scrolling, palette search mode, overflow keys, and async failure handling. Preserve all palette entries even if no hotkey is available; arrows/Enter must reach them. Use actual width rather than minimum-width expansion inside `render`.

**Gate:** all emitted rows fit widths 1, 20, 40, 60, 80, 120 with ANSI/Unicode content; stale async results are ignored; one failed widget does not blank every zone; disposal clears only host-owned resources.

### Phase 5: shared host and thin shell

Extract launcher invocation routines into `/host`. Consolidate both palette entry paths around one controller. Keep raw-input buffering isolated and tested; remove redraw bursts only if real-terminal evidence proves they are unnecessary. Default debug logging off; do not retain typed terminal input in production diagnostics. Make duplicate shell installation produce a clear error, not duplicate commands.

The shell factory registers itself with `registerPiExtension`, satisfying this repository's extension convention. It installs commands during factory loading, starts session resources on `session_start`, and disposes them on shutdown. Guard TUI-only work with `ctx.mode === "tui"`; RPC has `hasUI === true` but does not support custom TUI overlays.

**Gate:** `/px`, `/palette`, launcher `p`, and shortcut launch use consistent execution policy; fast follow-up keystrokes work; command-only actions cannot run with a fake command context; no timers/listeners start during `--list-models`.

### Phase 6: migrate this workspace explicitly

Migrate metadata-only consumers first, then agent-env, pinned-skills, and the remaining registrations. Replace imports from `../_shared/registry` with the root package; pass `pi`. Replace pinned-skills' direct `DocViewer` and dashboard-manager imports with supported subpaths. Review `busybar-alert/settings.ts` and `image-qa/index.ts` type imports as well as default entrypoints.

Change `.pi/settings.json` to load the shell once and remove local launcher wiring when switching. The standalone command-palette is not in the inspected project's settings list, so audit user/global settings before the interactive test; do not assume the file's existence means it is currently loaded. Do not edit the user's global settings without agreement.

Do not leave a re-export shim under `_shared` or run v1 and v2 hosts concurrently. This is a coordinated workspace migration. Remove obsolete shared implementation after the import audit is clean; update `AGENTS.md` to require registration through the public package and update both authoring guides. Preserve command names and extension/widget IDs.

**Gate:** `rg -n '_shared/' extensions` contains no obsolete framework imports, registration count matches the enabled baseline, dashboard config still applies, and the same actions execute once. Review migration changes independently from feature behavior changes.

### Phase 7: artifact validation, prerelease, and stable release

Pack library and shell. Install the tarballs and two fixture consumer packages in a temporary directory with an isolated Pi agent directory. Use distinct consumer dependency roots rather than a hoisted workspace-only install. Test imports, declarations, Pi resource discovery, shipped docs, and runtime UI there. Check tarball contents for accidental `ttmp`, home paths, credentials, session logs, debug output, and missing assets.

After approval, publish a prerelease using a `next` tag, install the exact published version in the clean fixture, and repeat the smoke test. Record the registry integrity and version tested. Promote a stable release only after all gates pass. Scope/auth checks and npm publication are future implementation tasks, not actions performed by this design ticket.

**Gate:** clean-directory artifact tests and actual published-prerelease tests pass. **Rollback:** pin the previous good versions; if a new release is defective, deprecate it and publish a fix rather than assuming an npm unpublish is safe. Preserve user dashboard files and document any API migration.

## 10. Test plan and acceptance evidence

### Unit and contract tests

| Area | Cases | Required assertion |
| --- | --- | --- |
| Registry | two physical copies, duplicate IDs, disposal, runtime isolation | one catalog per runtime, no stale callback |
| Identity | dots, empty IDs, duplicate nested IDs | deterministic rejection and stable widget keys |
| Docs | compiled module URL, changed cwd, missing/oversized file | package asset resolves or useful error |
| Settings | defaults, array copies, invalid numbers, reject/apply/cancel | no accidental commit, no duplicate apply |
| Palette | key conflicts, 37+ siblings, nested search, fast input | nothing disappears; search never executes |
| Layout | narrow widths, wide Unicode, ANSI, empty collections | `visibleWidth(line) <= width` |
| Dashboard | disabled zones, hidden defaults, unknown widget IDs | documented selection/merge behavior |
| Async | throwing widget, late result, shutdown during refresh | no unhandled rejection or stale redraw |
| Modes | TUI, RPC, print, JSON | no unsupported custom UI invocation |
| Host | double load, session replacement, command-only callback | clear conflict and valid context only |

### Packed artifact checks

Implement scripts with these names or document their exact replacements in the package README:

```bash
npm ci
npm run build
npm run typecheck
npm test
npm pack --workspace @wesen/pi-extension-framework --dry-run --json
npm pack --workspace @wesen/pi-extension-framework
npm pack --workspace @wesen/pi-extension-shell
npm run test:packed
npm run test:pi-loader
```

These are future commands; the root repository does not currently provide them. `test:packed` should create its own temporary directory, install tarballs without workspace symlinks, compile a consumer against exported declarations, and import every public subpath in native Node. An optional `tsc` no-deep-import test should verify private paths are unavailable.

`test:pi-loader` should run without a model request or credentials where possible. It must inspect extension error output, not only the process exit code; Pi may report an extension failure and continue. Use `timeout 20 pi --list-models` only as a load check, not proof of UI functionality.

### Interactive smoke sequence

Run in a disposable tmux terminal or equivalent PTY with isolated settings. Do not load unrelated personal extensions or invoke domain actions that mutate real files.

1. Start Pi and confirm exactly one shell and two fixture contributions.
2. Type `/px`, press Enter, type `/`, type a fixture ID, press Enter to leave search.
3. Press `a`; select a safe action and verify the counter increments once.
4. Reopen, press `?`; verify packaged README content and select a second doc.
5. Reopen, press `s`; toggle a setting and cancel, then repeat and apply.
6. Open `/px dashboard`; verify configured widgets and unknown-key preservation.
7. Open `/palette`; drill down, back out, search a string containing hotkey characters, and use arrows to select an unkeyed overflow item.
8. Press the configured shortcut immediately followed by a child key; verify no text leaks into the editor and no action duplicates.
9. Repeat at narrow dimensions and after a theme change.
10. `/reload`; repeat registration and shortcut checks. Disable a fixture and reload; it must disappear.
11. `/new` and session resume/fork where supported; verify old closures cannot update the new runtime.
12. Exit; verify resources are disposed. Run print/RPC checks separately.

Capture terminal dimensions, Pi/Node versions, fixture versions, expected/actual results, and stderr in ticket evidence. A screenshot of the launcher alone is not proof that settings, reload, or artifact paths work.

### Definition of done for implementation

- [ ] Approved package names, npm owner/access, license, and host support matrix.
- [ ] Explicit exports, declarations, compiled artifacts, reproducible build.
- [ ] No dependency on this workspace's filesystem layout.
- [ ] Two independent packages share discovery in the real loader.
- [ ] Lifecycle ownership and runtime scope verified; no cast-based context fabrication.
- [ ] Every advertised field implemented or rejected with a documented limitation.
- [ ] Packed docs/settings/dashboard/palette integration passes outside the repo.
- [ ] Workspace migrated without v1/v2 coexistence or obsolete private imports.
- [ ] Prerelease tested from npm; stable release and rollback instructions recorded.

## 11. Risks and open questions

**Runtime identity is the highest architectural uncertainty.** The current same-realm probe proves only module-copy sharing, not Pi runtime identity. Resolve that first; do not bury it beneath packaging work.

**Public scope and licensing require owner decisions.** The names in this guide are placeholders and the inspected repository search did not find a license. Permission to analyze and plan publication is not evidence that a specific license has been approved.

**Host compatibility must be empirical.** The local loader aliases old Pi names; a compiled external package can encounter different resolution paths. The guide recommends the current namespace but does not claim an untested version range.

**Context narrowing may affect real actions.** Search consumer callbacks for `newSession`, `fork`, `reload`, `switchSession`, `navigateTree`, and `waitForIdle` before migration. Command-only palette entries need explicit handling rather than unsafe casts.

**UI hardening can expand scope.** Fix correctness and lifecycle bugs before release, but do not turn extraction into a rewrite of every modal. Full Markdown rendering and richer settings editors can follow if the initial API accurately documents its limits.

**Raw terminal diagnostics can expose user input.** The existing debug controller logs input and codepoints to a temp file. Keep diagnostics opt-in and avoid logging free text by default; define retention and permissions if the debug feature is retained.

**Multi-process state is intentionally not shared.** Two terminal sessions in different processes have separate registries. Discovery across processes would need IPC and is not required for reuse across extension packages.

## 12. File and API reference map

Paths below are relative to the repository at the baseline commit unless explicitly described as installed Pi files. Line anchors describe the inspected revision and will move during extraction.

| File and anchor | Read for | Proposed destination |
| --- | --- | --- |
| `extensions/_shared/registry.ts:4-117` | Actions, docs, settings types | `src/contracts.ts` |
| `extensions/_shared/registry.ts:119-201` | Dashboard/palette/registration types | `src/contracts.ts` |
| `extensions/_shared/registry.ts:208-252` | Global registry mechanics | `src/registry.ts` |
| `extensions/launcher/index.ts:96-278` | Invocation, docs/settings orchestration | `src/host.ts`, `src/docs.ts` |
| `extensions/command-palette/index.ts:100-228` | Raw-input opening controller | Host palette controller |
| `extensions/command-palette/index.ts:274-296` | Redraw and input replay safeguards | Controller tests, then controller |
| `extensions/_shared/ui/extension-launcher.ts:4-49,440-500` | Modal result/state, grouping/search | `src/ui/extension-launcher.ts` |
| `extensions/_shared/ui/action-picker.ts:11-98` | Action selection and scrolling defect | `src/ui/action-picker.ts` |
| `extensions/_shared/ui/command-palette.ts:31-348` | Navigation/search and root grouping | `src/ui/command-palette.ts` |
| `extensions/_shared/ui/palette-keys.ts:14-75` | Assignment/conflict/filter behavior | `src/ui/palette-keys.ts` |
| `extensions/_shared/ui/doc-viewer.ts:11-58` | Minimal Markdown view | `src/ui/doc-viewer.ts` |
| `extensions/_shared/ui/settings-view.ts:19-159` | Draft/apply and actual editor support | `src/ui/settings-view.ts` |
| `extensions/_shared/dashboard/config.ts:6-89` | Schema, paths, precedence, writes | `src/dashboard/config.ts` |
| `extensions/_shared/dashboard/layout.ts:14-86` | Text conversion, inline/stack/grid | `src/dashboard/layout.ts` |
| `extensions/_shared/dashboard/manager.ts:11-106` | UI mounting and async rendering | `src/dashboard/controller.ts` |
| `extensions/_shared/ui/dashboard-overlay.ts:5-57` | Async cache and scroll lifecycle | `src/ui/dashboard-overlay.ts` |
| `extensions/agent-env/index.ts:130-188` | Representative schema consumer | Keep domain extension; migrate imports |
| `extensions/pinned-skills/index.ts:17-19,185-280` | UI/service imports, custom settings | Keep domain extension; migrate imports |
| `extensions/busybar-alert/settings.ts:1` | Public settings type dependency | Migration audit |
| `extensions/image-qa/index.ts:4-5` | Registry and settings-option imports | Migration audit |
| `.pi/settings.json:1-19` | Project loading paths | Replace local host with shell once |
| `package.json:1-8` | Private workspace, no package build | Keep private; add workspace tooling |
| `docs/pi-shared-extension-framework-guide.md` | Existing onboarding concepts | Update to public imports/contracts |
| `docs/pi-tui-ui-authoring-guide.md` | Component mental model | Correct narrow-width examples on migration |
| `docs/pi-testing-guide.md` | Existing load/tmux workflow | Correct stale key/search instructions |

### Installed Pi references

The inspected documentation root is `/home/manuel/.nvm/versions/node/v24.18.0/lib/node_modules/@earendil-works/pi-coding-agent/`. This is an investigation location, not a path to put into published code. Future readers should open equivalent files in their own installed Pi package.

- `docs/packages.md`: manifests, ordinary versus resource dependencies, peer packages, installation scopes, tarball resources.
- `docs/extensions.md`: factory lifetime, `session_start`/`session_shutdown`, `ExtensionContext` versus `ExtensionCommandContext`, TUI/RPC/print mode behavior.
- `docs/tui.md`: Component width contract, invalidation, overlays, disposal, settings and status patterns.
- `docs/keybindings.md`: key identifiers and injected keybinding-manager conventions.
- `examples/extensions/with-deps/package.json`: explicit `pi.extensions` manifest with a runtime dependency.
- `examples/extensions/tools.ts`: current `SettingsList` wiring and a `ctx.mode !== "tui"` guard.
- `dist/core/extensions/loader.js:39-55,92-105`: installed namespace alias evidence; implementation detail, not a public API to import.

### Ticket evidence

- `scripts/01-contract-probes.mjs`: reproducible same-realm registry/key probes using Node's TypeScript stripping.
- `sources/01-contract-probe-results.txt`: captured assertions against current code.
- `reference/01-investigation-diary.md`: investigation, validation, caveats, and delivery record.

## 13. Intern's first day checklist

Read sections 2 and 3, then annotate the source path of one agent-env action from registration through launcher execution. Run the ticket probe and explain why the assertion about 36 palette items is a defect confirmation rather than a desirable result. Open the local registry and point to the exact difference between a shared module store and a runtime-scoped store.

Then implement only the Phase 0 loader fixture. Bring its lifecycle trace, the proposed namespace baseline, and the npm/license questions to review before writing the extraction. If you can explain why `commands` does not register a command, why a relative README can still fail, and why a TypeScript context cast is unsafe, you understand the three most important boundaries in this project.
