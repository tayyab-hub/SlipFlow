# CLAUDE.md — Factory Software

This file is read automatically at the start of every Claude Code session. It is the
project's standing contract: stack, conventions, and hard rules. Keep it short and
current. Session-to-session state lives in [PROGRESS.md](PROGRESS.md) — read that too.

---

## 1. What this is

Factory Software — a **desktop application** (offline-first, runs on the operator's own
machine, no server required). Data lives in a local SQLite file; data moves in and out
via Excel spreadsheets.

> **TODO (owner):** replace this paragraph with the real one-paragraph product
> description — who uses it and what problem it solves. Claude should ask rather than
> invent domain rules that are not written down here.

**Platform target:** Windows 11 (primary). Do not add macOS/Linux-only code paths
without asking.

---

## 2. Tech stack

Do not introduce a new library, framework, or state manager that is not on this list.
If something here is genuinely the wrong tool for a task, **stop and ask** — do not
swap it silently.

| Layer | Choice | Notes |
|---|---|---|
| Shell | **Electron** | Main + preload + renderer. Context isolation ON, `nodeIntegration` OFF. |
| UI | **React** + **TypeScript** | Function components + hooks only. No class components. |
| Styling | **Tailwind CSS** | Utility classes in JSX. No CSS-in-JS, no styled-components. |
| Components | **shadcn/ui** | Copy-in components under `src/renderer/components/ui/`. Owned by us, editable. |
| Database | **SQLite** | Single local file. Accessed **only** from the Electron main process. |
| Spreadsheets | **SheetJS (xlsx)** | All Excel import/export. Runs in main process, not the renderer. |
| Language | **TypeScript, strict** | `strict: true`. No `any` unless commented with why. |

---

## 3. Folder structure

```
Factory_Software/
├── CLAUDE.md                  # this file — the contract
├── PROGRESS.md                # rolling state: what's built, what's next
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── electron.vite.config.ts    # or equivalent bundler config
└── src/
    ├── main/                  # Electron main process (Node context)
    │   ├── index.ts           # app lifecycle, window creation
    │   ├── ipc/               # one file per IPC domain, registers handlers
    │   ├── db/
    │   │   ├── schema.sql     # authoritative schema (see rule 5.1)
    │   │   ├── migrations/    # NNNN_description.sql, append-only
    │   │   └── repositories/  # one file per table/aggregate; all SQL lives here
    │   └── excel/             # SheetJS import + export logic
    ├── preload/
    │   └── index.ts           # contextBridge surface — the ONLY main↔renderer door
    ├── renderer/              # React app (browser context, no Node APIs)
    │   ├── main.tsx
    │   ├── App.tsx
    │   ├── pages/             # one folder per screen
    │   ├── components/
    │   │   └── ui/            # shadcn/ui primitives
    │   ├── hooks/
    │   └── lib/               # renderer-only helpers (utils, formatters)
    └── shared/                # types + constants imported by BOTH sides
        ├── types.ts           # domain models, IPC request/response shapes
        └── ipc-channels.ts    # channel name constants — never inline a raw string
```

### Conventions

- **Files:** `kebab-case.ts` / `kebab-case.tsx`. Exception: React component files may be
  `PascalCase.tsx` if that matches what's already in the folder — match the neighbours.
- **Components:** `PascalCase`. **Functions/vars:** `camelCase`. **DB tables/columns:**
  `snake_case`.
- **Imports:** use the `@/` alias for `src/renderer`, `@shared/` for `src/shared`.
  No `../../../` chains deeper than one level.
- **Types:** anything crossing the IPC boundary is defined once in `src/shared/types.ts`
  and imported by both sides. Never redeclare a shape on the renderer side.
- **No SQL outside `src/main/db/repositories/`.** Pages and components call IPC, never a
  database.
- **No `require`/`fs`/`path`/`child_process` in `src/renderer/`.** If the UI needs
  something from the OS, add an IPC handler and expose it through the preload bridge.

---

## 4. Commands

> **TODO (owner):** fill these in once `package.json` exists (Phase 1).

```
npm install        # install deps
npm run dev        # run the app in development
npm run build      # production build
npm run typecheck  # tsc --noEmit  ← run before declaring any task done
npm run lint
npm test
```

**Definition of done for any code change:** `npm run typecheck` passes and the app still
launches. Do not report a task complete without that.

---

## 5. Do not touch — hard rules

These exist because breaking them is expensive to undo. Violating one is worse than
leaving a task unfinished.

1. **Never rewrite, drop, or restructure the database schema without asking.** Schema
   changes are **additive migrations only**: add a new numbered file in
   `src/main/db/migrations/`, never edit a migration that already exists, never
   `DROP TABLE`, never rename a column in place. If a change seems to require destroying
   data, stop and ask.
2. **Never delete or overwrite a user's `.db` file**, and never point the app at a
   different database path as a workaround.
3. **Never disable `contextIsolation`, enable `nodeIntegration`, or turn off
   `sandbox`/CSP** to make something work. Route it through preload IPC instead.
4. **Do not restructure folders, rename files wholesale, or "reorganize" working code**
   unless that is the explicit task.
5. **Do not upgrade major versions** of Electron, React, or the SQLite driver, and do not
   add dependencies outside §2, without asking first.
6. **Do not delete or rewrite tests** to make a suite pass. Fix the code or report the
   failure.
7. **Do not commit** unless asked. Committing is the owner's checkpoint (see §6).
8. **Do not touch `.env`, credentials, or anything in `data/` / `userdata/`.**
9. **Do not silently change scope.** If the requested task turns out to be wrong or
   impossible, say so and stop — do not substitute a different task.
10. **Excel is untrusted input.** Every importer validates and reports bad rows; it never
    partially writes a half-imported sheet. Wrap multi-row imports in a transaction.

---

## 6. Workflow (how sessions are run)

- **One phase per session.** Work the current phase only; do not start the next one.
- **Commit after every phase.** The owner commits — it's the revert point if a phase goes
  wrong. Reverting beats asking Claude to repair a broken state.
- **End of every session: update [PROGRESS.md](PROGRESS.md)** — what was built, what
  works, what's left, known issues. A fresh session reads CLAUDE.md + PROGRESS.md and
  must be able to continue without re-exploring the whole codebase.
- **When context is thin or a task is ambiguous, ask.** Most damage comes from a session
  guessing at intent it lost, not from carelessness.

---

## 7. Phase tracker

**Current phase: Phase 0 — repo + context scaffolding ✅ complete**
**Next phase: Phase 1 — not yet defined**

> **TODO (owner):** paste the phase plan here (Phase 1 … Phase N, one line each), or
> add a `PLAN.md` and link it. Until this is filled in, a new session does not know what
> Phase 1 is and should ask.

| Phase | Goal | Status |
|---|---|---|
| 0 | Git repo, `.gitignore`, CLAUDE.md, PROGRESS.md | ✅ Done |
| 1 | _TBD_ | ⬜ Not started |

Detail for the phase in flight lives in PROGRESS.md, not here. This table is the map;
PROGRESS.md is the position.
