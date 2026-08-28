---
name: OpenAPI numeric compatibility
description: Compatibility constraint between Orval-generated Zod schemas and the workspace Zod version.
---

When adding numeric fields to the OpenAPI contract, use `type: number` unless integer-specific validation is essential.

**Why:** The installed Zod v3 runtime does not expose the `z.int()` helper emitted by the current generator for OpenAPI `integer` fields, so codegen’s chained library typecheck fails.

**How to apply:** If an API truly needs integer-only validation, add an explicit compatible refinement in handwritten server validation instead of relying on generated `z.int()`.