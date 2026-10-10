
# Development Rules

Follow the approved specifications in docs/specs/
and contracts in docs/design/.

Execute only the assigned atomic subtask.

For implementation tasks:
- Use $incremental-implementation.
- Use $test-driven-development for business rules,
  security checks and regression-prone changes.
- Use $source-driven-development when external APIs
  or library behavior require verification.

Constraints:
- Three developers working in parallel.
- Respect assigned file ownership.
- Preserve approved API contracts.
- Use only free infrastructure and AI tiers.
- Never commit secrets.
- Never bypass authorization or fabricate AI results.

Before reporting completion:
- Run relevant tests and build checks.
- Report changed files and actual verification results.
- Report blockers and unmet acceptance criteria.
