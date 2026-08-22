# Repository context router

Read only what the task touches:

- Product identity, boundaries, and privacy: `PRODUCT.md`
- User setup and command contract: `README.md`
- Algorithms and integration seams: `docs/ARCHITECTURE.md`
- Acceptance requirements: `docs/PRD.md`
- Image behavior and recipe types: `src/core/`
- Browser behavior: `src/App.tsx`, `src/workbench/`, and `e2e/`
- CLI and Aseprite handoff: `src/cli/`
- Change consequences: `.agents/change-surface-matrix.json`
- Product progress: `.project-compass/contract.json`
- Behavior assurance: `.pronto/behavior-assurance.json`

The integration lane is `dev`. Preserve `main` as deployable. Do not add uploads, telemetry, remote inference, or claims of production-ready art without an explicit product-contract decision.
