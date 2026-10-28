# Architecture rules (template)

Copy to `.github/second-look/rules.md` and replace with the repo's real rules. Keep it short; Second Look's main reviewer reads all of it on every run, alongside the repo's docs.

- Data access goes through the data layer (core-db / GraphQL); no raw SQL in app code.
- Auth and secrets never appear in client bundles, logs or test fixtures.
- New packages follow the foundation SDK patterns; no parallel implementations of existing foundation utilities.
- Feature flags gate user-visible behaviour changes (GrowthBook).
- Migrations are additive and reversible; destructive ones need a separate PR.
- Public API or schema changes update their docs and types in the same PR.
