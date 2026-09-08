# Quickstart: Lobby Roster (Feature 023)

## Setup

No additional setup required — the roster is built into the existing lobby infrastructure.

```bash
# Install dependencies (if not already)
pnpm install

# Build all packages
pnpm build
```

## Running Locally

```bash
# Start the host server (lobby mode)
pnpm host

# The server boots on :8080 with the lobby UI on :5173
# Open two browser tabs to http://localhost:5173/lobby
```

## Key Flows to Validate

### 1. Basic Roster Display

1. Open `http://localhost:5173/lobby` in Tab A
2. Set a handle (e.g., "Alice")
3. Open `http://localhost:5173/lobby` in Tab B
4. Set a handle (e.g., "Bob")
5. **Expected**: Both tabs show "Players online (2)" with both entries
6. **Expected**: Alice's tab shows "Alice (you)" with "In lobby" status
7. **Expected**: Bob's tab shows "Bob (you)" with "In lobby" status

### 2. Status Updates on Match Join

1. With both tabs in the lobby (roster showing 2 players)
2. In Tab A: Create a public match
3. **Expected**: Tab B's roster updates Alice's status to "In game" within 1 second
4. In Tab B: Join the match
5. **Expected**: Tab B no longer shows in the lobby roster (it's now in the match view)

### 3. Spectating Status

1. Start a match between Alice and Bob
2. Open Tab C as a spectator (join via match URL with `/spectate`)
3. **Expected**: Alice and Bob see "Players online (3)" with Charlie as "Spectating"

### 4. Disconnect Removal

1. Two players in the lobby (roster shows 2)
2. Close Tab B (disconnect)
3. **Expected**: Tab A's roster updates to "Players online (1)" within 2 seconds

### 5. Degraded State

1. Start the server without roster support (older version)
2. Open the lobby
3. **Expected**: Roster shows "Presence unavailable" with explanatory note

### 6. Handle Change

1. Player "Alice" is in the lobby roster
2. Alice changes her handle to "Nova" via the profile page
3. **Expected**: Roster updates to show "Nova" with "In lobby" status

### 7. Anti-Flap Grace Period

1. Player joins a match and immediately leaves (within 500ms)
2. **Expected**: Other players see at most ONE status change broadcast, not two rapid toggles

## Test Commands

```bash
# Run matchmaking tests (server roster logic)
pnpm --filter @europa/matchmaking test

# Run networking tests (conformance)
pnpm --filter @europa/networking test

# Run console tests (UI + transport)
pnpm --filter @europa/console test

# Run all tests
pnpm test

# Type check
pnpm typecheck

# Lint
pnpm lint

# Format check
pnpm format:check
```

## Expected Test Counts

After implementation, the test counts should be:
- **matchmaking**: +8 test files (roster unit + integration) ≈ +40-60 tests
- **networking**: +1-2 conformance updates ≈ +5-10 tests
- **console**: +4 test files (component + a11y + reducer + derivation) ≈ +30-40 tests

## Coverage Targets

- Server roster logic: ≥80% statement coverage
- Console roster component: ≥80% statement coverage
- Overall project coverage: maintained at ≥80%

## Wire Protocol Validation

To verify roster events on the wire:

1. Open browser DevTools → Network tab → WS connection
2. Filter for `lobbyEvent` frames
3. Subscribe to lobby → expect a `roster` event as the first roster frame
4. Join a match → expect a `rosterDelta` event
5. Leave a match → expect a `rosterDelta` event
6. Wait 60 seconds → expect a full `roster` snapshot

## Accessibility Validation

1. Navigate the roster using only keyboard (Tab/Shift+Tab)
2. Verify each entry is focusable and has visible focus state
3. Use a screen reader (VoiceOver/NVDA) to verify:
   - Roster is announced as a list
   - Entries are announced with handle and status
   - Updates are announced via live region
4. Check contrast ratios: all text ≥ 4.5:1, status badges ≥ 3:1

## Known Limitations (v1)

- Roster is in-memory only — lost on server restart
- Stale delta entries persist until next full snapshot (max 60s)
- No roster sorting options (handle-order only)
- No player count limits or moderation
- Private match participants show status only (no match identity leaked)
