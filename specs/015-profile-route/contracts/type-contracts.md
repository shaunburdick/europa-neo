# Type Contracts: Profile Route & Identity Onboarding

## 1. Route Extension Contract

The `Route` union MUST be extended with exactly one new variant:

```typescript
{ readonly kind: 'profile'; readonly pathname: '/profile' }
```

**Exhaustive match requirement**: Every switch over `Route.kind` must handle `'profile'`. This is enforced by TypeScript's exhaustive switch checking — adding the variant without handling it produces a compile error.

### parseRoute contract

```typescript
parseRoute('/profile')         → { kind: 'profile', pathname: '/profile' }
parseRoute('/profile?returnTo=...') → { kind: 'profile', pathname: '/profile' }
// Query parameters are NOT part of route classification
```

### adaptRoute contract

```typescript
adaptRoute({ kind: 'profile', pathname: '/profile' }, snapshot)
  → { kind: 'profile', route: { kind: 'profile', pathname: '/profile' } }
```

### executeRouteEntry contract

```typescript
executeRouteEntry({ kind: 'profile', route: ... }, commands) → null
// Profile route performs no I/O at entry
```

## 2. ProfileView Component Contract

```
ProfileView renders based on identityStatus:

identityStatus === 'restoring'
  → "Restoring your session…" indicator + disabled Continue button

identityStatus === 'unnamed'
  → Handle input form (label, input, submit button, error display)

identityStatus === 'named'
  → "Welcome back, {handle}" card + "Continue to lobby" button
  → If returnTo present: "Continue to match" button
```

### Auto-navigate contract (FR-010)

After successful handle submission (unnamed → named transition):
- If `returnTo` is non-null → `history.pushState(null, '', returnTo)`
- If `returnTo` is null → `history.pushState(null, '', '/lobby')`

### returnTo safety contract (FR-005)

```
readReturnTo('')                          → null
readReturnTo('?returnTo=')                → null (empty)
readReturnTo('?returnTo=/lobby')          → '/lobby'
readReturnTo('?returnTo=%2Fmatch%2Fabc')  → '/match/abc'
readReturnTo('?returnTo=https://evil.com') → null (external)
readReturnTo('?returnTo=//evil.com')      → null (protocol-relative)
readReturnTo('?returnTo=%2F..%2Fsecret')  → null (traversal)
readReturnTo('?returnTo=not-starting-slash') → null (not absolute)
```
