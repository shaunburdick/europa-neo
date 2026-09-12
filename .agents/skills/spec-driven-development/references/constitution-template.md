# Constitution Template

Copy this template to `.specify/memory/constitution.md`. This must be created and approved **before** any feature specs are written. All technical decisions throughout the project must reference and align with it.

---

```markdown
# Project Constitution: <Project Name>

> Version: 1.0
> Last Updated: <date>

## Core Principles

Keep to 5–7 principles. More than that dilutes them.

1. **<Principle Name>**: <What it means and why it matters for this project>
2. **<Principle Name>**: <What it means and why it matters for this project>
3. **<Principle Name>**: <What it means and why it matters for this project>

## Technical Decisions

Document the stack with rationale. Future decisions must align with these or explicitly amend them.

| Concern | Decision | Rationale |
|---------|----------|-----------|
| Language | <e.g., TypeScript 5.x> | <why> |
| Runtime | <e.g., Node.js 22 LTS> | <why> |
| Framework | <e.g., Fastify> | <why> |
| Storage | <e.g., PostgreSQL 16> | <why> |
| Testing | <e.g., Vitest> | <why> |
| Deployment | <e.g., Docker + Fly.io> | <why> |

## Quality Standards

These are the minimum bars — not targets to aim for, but floors to never go below.

- **Test coverage**: ≥ <X>% line coverage for all new code
- **Linting**: Zero errors, zero warnings — no suppression comments ever
- **Type safety**: Strict mode enabled, no `any` types without documented justification
- **Documentation**: All public APIs must have doc comments
- **Commits**: Feature branches only (`001-feature-name`), conventional commit messages

## Anti-Patterns to Avoid

Be explicit. Vague rules get ignored.

- ❌ <Anti-pattern>: <Why it's harmful here, and what to do instead>
- ❌ <Anti-pattern>: <Why it's harmful here, and what to do instead>
- ❌ Disabling lint rules: Fix the code, not the linter
- ❌ `any` types: Define an interface or use a generic

## Success Metrics

### Product
- <Measurable outcome — e.g., "Users can complete X task in under 30 seconds">

### Technical
- <Measurable outcome — e.g., "p95 API latency < 200ms">
- <Measurable outcome — e.g., "Zero critical security vulnerabilities in dependency audit">

### Operational
- <Measurable outcome — e.g., "Deployment takes < 5 minutes with zero downtime">

## Amendment Process

This constitution can be amended when requirements evolve. To amend:
1. Propose the change with rationale
2. Document the impact on existing features
3. Get explicit approval before updating
4. Note the amendment in a changelog at the bottom of this file

## Amendment Log

| Date | Change | Rationale |
|------|--------|-----------|
```
