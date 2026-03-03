# Development Standards

## Quality Gates

- All pull requests must pass `npm run ci:check` in the repository root.
- Keep protocol boundaries validated through `extension` `check-types` script.
- Keep server regression checks passing through `server` `npm test`.

## Code Structure

- Separate transport layer (`routes`, `socket handlers`) from application services.
- Keep business rules in application/domain modules, not in entrypoint files.
- Prefer dependency injection for side-effectful collaborators (db, file storage, network clients).

## Complexity Limits

- Function length: <= 50 logical lines
- File length: <= 300 logical lines
- Nesting depth: <= 3
- Cyclomatic complexity: <= 10

## Failure Handling

- Do not add silent fallback logic that hides runtime failures.
- Surface operational errors with explicit logs and actionable messages.
- Keep acknowledgment payloads explicit and protocol-compliant.
