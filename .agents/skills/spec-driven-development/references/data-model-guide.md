# Data Model Authoring Guide

Reference for writing `specs/###-feature-name/data-model.md` during Phase 4 (Planning).

## Purpose

The data model translates the WHAT from feature specs into the concrete entities, fields, and relationships that the implementation will use. It is the bridge between requirements and code.

## Structure

Define one section per entity. Each section should include:

1. **Entity name and description** — what it represents in the domain
2. **Fields** — name, type, constraints, and a brief note on purpose
3. **Indexes** — which fields need indexes and why
4. **Relationships** — foreign keys, join tables, cardinality
5. **Validation rules** — constraints enforced at the application layer
6. **State transitions** — if the entity has a lifecycle (e.g., `pending → active → archived`)

## Example

```markdown
## User Entity

Represents an authenticated user of the system.

### Fields

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `id` | UUID | PRIMARY KEY | Generated on creation |
| `email` | TEXT | NOT NULL, UNIQUE | Lowercased before storage |
| `display_name` | TEXT | NOT NULL, max 100 chars | |
| `role` | TEXT | NOT NULL, DEFAULT 'member' | Enum: admin, member, viewer |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |
| `last_login_at` | TIMESTAMPTZ | NULL | Null until first login |

### Indexes

- `idx_users_email` on (`email`) — supports login lookup
- `idx_users_role` on (`role`) — supports admin queries

### Relationships

- Has many `Session` (one-to-many, cascade delete)
- Has many `AuditLog` (one-to-many, retain on delete)

### Validation Rules

- `email` must match RFC 5322 format
- `display_name` must not be blank after trimming
- `role` must be one of: `admin`, `member`, `viewer`

### State Transitions

Not applicable — users do not have a lifecycle state.
```

## Tips

- **Extract entities from acceptance criteria**, not just from the problem statement. AC often reveals fields that the problem statement glosses over.
- **Document NULL vs NOT NULL explicitly.** "Optional" fields should be NULL, not empty strings.
- **Name fields consistently.** Pick a convention (`created_at` vs `createdAt`) and stick to it across all entities.
- **Don't model the future.** Only include fields required by the current spec. Add fields in future specs when needed.
- **State machines deserve a diagram.** If an entity has more than 3 states, draw the transition graph in ASCII or link to one.
