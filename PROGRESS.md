# PROGRESS.md — Factory Software

Rolling session log. **A fresh Claude Code session reads
[CLAUDE.md](CLAUDE.md) + this file and should be able to continue without re-exploring
the codebase.** Update the "Current state" block and add a session entry at the end of
every session.

---

## Current state

**Phase:** 0 — repo + context scaffolding
**Status:** ✅ Complete
**Next phase:** 1 — not yet defined (phase plan not supplied; ask the owner)
**Last updated:** 2026-08-10

### What works right now

- Local git repository initialised on branch `main` at `d:\Factory_Software`.
- `.gitignore` covering `node_modules/`, build output, native module artifacts, logs,
  `.env`, and — importantly — SQLite files and `data/` so a real database is never
  committed.
- `CLAUDE.md`: tech stack, folder structure conventions, hard "do not touch" rules,
  workflow, and phase tracker.
- `PROGRESS.md`: this file.

### What does NOT exist yet

Everything else. There is **no application code at all** — no `package.json`, no
`node_modules/`, no Electron main process, no React renderer, no database, no build
config. Nothing runs; there is nothing to run.

### What's left / next actions

1. **Owner:** define the phase plan and paste it into CLAUDE.md §7 (or add `PLAN.md`).
2. **Owner:** fill the three `TODO (owner)` markers in CLAUDE.md — product description,
   npm scripts (after Phase 1), phase table.
3. **Phase 1 (likely, pending owner confirmation):** scaffold the Electron + Vite + React
   + TypeScript project, wire Tailwind and shadcn/ui, get a blank window launching via
   `npm run dev`, confirm `npm run typecheck` passes. Nothing else — no database, no
   Excel, no features.

### Known issues / risks

- Phase plan is undefined, so "which phase am I on" in CLAUDE.md is a placeholder. A new
  session must ask rather than assume.
- Product domain is undocumented. Do not infer business rules (what a "factory" record is,
  which fields matter, how Excel sheets are shaped) — ask.
- SQLite driver not chosen yet. If `better-sqlite3` is used it is a native module and needs
  rebuilding against Electron's ABI (`electron-rebuild` or `@electron/rebuild`); budget
  time for this in Phase 1 and note the outcome here.
- No git remote configured — history is local only, so the repo is not a backup. Add a
  remote (or back up the folder) before the codebase is worth losing.

---

## How to update this file

At the end of each session, append a new `## Session N` entry below and refresh the
**Current state** block above. Keep entries factual — "works" means it was actually run
and observed, not "was written".

Template:

```markdown
## Session N — YYYY-MM-DD — Phase X

**Built:** what was actually added or changed (files/areas, not a diff).
**Verified:** what was run and observed to work (commands, manual checks).
**Not done / left:** anything in scope that was skipped, and why.
**Known issues:** bugs, hacks, TODOs left behind, and where they are.
**Decisions:** choices made that a later session must not silently reverse.
**Next:** the single next action.
```

---

## Session log

## Session 1 — 2026-08-10 — Phase 0

**Built:** Git repo (`main`), `.gitignore`, `CLAUDE.md`, `PROGRESS.md`. No application
code.
**Verified:** `git init` succeeded; git is v2.55.0 and user identity is configured
globally, so commits will work.
**Not done / left:** Phase plan not recorded (not supplied). Three `TODO (owner)` markers
remain in CLAUDE.md.
**Known issues:** See "Known issues / risks" above.
**Decisions:** Default branch is `main`. Database files and `data/` are git-ignored on
purpose — the app's real data must never enter version control. Schema changes are
additive-migration-only (CLAUDE.md §5.1).
**Next:** Owner defines Phase 1 scope; then scaffold the Electron/React/TS app.
