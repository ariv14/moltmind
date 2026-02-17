# MoltMind Release Instructions

> Referenced from: CLAUDE.md (Version Strings, CI/CD, Git Workflow, What NOT to Do sections)
> See also: CLAUDE.md for version string locations, code style, and testing conventions.

## Before Releasing

### 1. Verify the release is necessary

Check if any **published files** have changed since the last release. Only these files ship to npm (defined by `"files"` in `package.json`):

```
dist/        — compiled TypeScript
README.md    — user-facing docs
LICENSE      — MIT license
```

Files NOT published (changes to these do NOT warrant an npm release):
- `CLAUDE.md`, `release_instructions.md`, `.github/`, `tests/`, `scripts/`, `src/` (source, not dist)

**Rule:** If only non-published files changed (e.g., CLAUDE.md, test files, CI config), do NOT publish to npm. Commit, push, and optionally tag — but skip `npm publish`.

### 2. Categorize the release

| Change type | Version bump | Example |
|-------------|-------------|---------|
| Breaking change (limits, removed features, schema migration) | Major (x.0.0) | Free tier limits added |
| New feature, new tool, new flag | Minor (0.x.0) | License system, VectorStore |
| Bug fix, dependency update, docs in README | Patch (0.0.x) | Fix mm_session_save after mm_init |
| Only non-published files changed | No release | CLAUDE.md update, test additions |

### 3. Run the pre-release checklist

```bash
# 1. Lint — must be clean
npm run lint

# 2. Tests — all must pass
npm test

# 3. Build — must succeed
npm run build

# 4. STDIO sanity check — should return valid JSON-RPC, not hang
echo '{"jsonrpc":"2.0","method":"initialize","id":1,"params":{"capabilities":{},"clientInfo":{"name":"test","version":"0.1.0"},"protocolVersion":"2025-03-26"}}' | node dist/index.js
```

All four must pass before proceeding.

## Releasing

### 4. Update version strings (4 places — see CLAUDE.md "Version Strings" section)

| File | Field |
|------|-------|
| `package.json` | `"version"` |
| `src/index.ts` | McpServer constructor `version` |
| `src/tools/mm_status.ts` | Response `version` field |
| `tests/tools.test.ts` | Version assertion in mm_status test |

If a new file starts referencing the version string, update both this table AND the CLAUDE.md "Version Strings" section.

### 5. Re-run checks after version bump

```bash
npm run lint && npm test
```

### 6. Commit, tag, and push

```bash
git add package.json src/index.ts src/tools/mm_status.ts tests/tools.test.ts
git commit -m "chore: bump to vX.Y.Z for npm publish"
git tag vX.Y.Z
git push && git push origin vX.Y.Z
```

### 7. Build and publish

```bash
npm run build
npm publish
```

### 8. Create GitHub release

```bash
gh release create vX.Y.Z --title "vX.Y.Z — <short summary>" --notes "<release notes>"
```

Release notes should include:
- What changed and why
- Breaking changes (if any) with migration steps
- Link to full changelog: `https://github.com/ariv14/moltmind/compare/vPREVIOUS...vX.Y.Z`

## Post-Release

### 9. Verify the publish

```bash
npm info moltmind version   # should show the new version
npx -y moltmind --help      # quick smoke test (should not error)
```

### 10. Update CLAUDE.md if needed

If the release introduced new conventions, files, or rules, update CLAUDE.md and commit separately. This is a docs-only commit — do NOT bump the version or publish again.

Sections in CLAUDE.md that commonly need updating after a release:
- **File Organization** — if new source files were added
- **MCP Tools table** — if tool behavior changed
- **Database Conventions / Migrations** — if schema version bumped
- **Version Strings** — if a new file starts containing the version
- **What NOT to Do** — if new invariants were introduced

## Summary: When to publish vs when not to

| Scenario | Action |
|----------|--------|
| New feature / bug fix / README change | Bump version, publish to npm, tag, release |
| CLAUDE.md / test / CI / script changes only | Commit and push. No version bump, no npm publish |
| Docs-only change after a release | Commit and push. Tag only if you want a reference point |
