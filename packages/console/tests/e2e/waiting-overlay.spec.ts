/**
 * Focused E2E — waiting-for-opponent overlay over the REAL wire
 * (post-playtest fix).
 *
 * Reproduces the playtested defect end-to-end and proves the fix:
 *
 *   1. A public 2-player match is CREATED (seat 1 claimed) but still
 *      filling. A lobby-style host has pre-registered the engine
 *      session with the live server (the natural evolution of the
 *      host recipe for unfilled matches), so the wire join succeeds.
 *   2. The FIRST console opens its join URL, joins (status 'live'),
 *      receives only the tick-0 join snapshot — and must see the
 *      waiting-for-opponent overlay instead of a silent black grid.
 *   3. The second seat fills via matchmaking → auto-start attaches
 *      both seats and ticks begin. The overlay must disappear on the
 *      first console and ticks must flow on BOTH consoles.
 *
 * Determinism discipline: no arbitrary sleeps — every wait polls an
 * observable condition. The trick that makes "joined but not started"
 * observable on the real wire is the cadence: the server's first tick
 * fire lands ~TICK_MS after listen(), so a console joining inside that
 * window deterministically holds a tick-0 snapshot (worlds are created
 * at tick 0; every broadcast happens after `advance()`, i.e. tick ≥ 1).
 * TICK_MS is deliberately large (10 s) to give slow CI runners a wide
 * join window; the fill + assertions happen well inside it.
 */

import {
  applyCommand,
  createRng,
  createWorld,
  ENGINE_CONSTANTS,
  isTerminal,
  tick,
} from '@europa/engine';
import { computePlayerView } from '@europa/fog';
import { createMatchmaker } from '@europa/matchmaking';
import {
  createMatchServer,
  type EngineSession,
  type Logger,
  type MatchConfig,
  type MatchId,
  type MatchmakerBridge,
  NETWORK_DEFAULT_CONFIG,
  NULL_LOGGER,
  type PlayerId,
  type RegisterMatchRequest,
  type Server,
  type ServerDeps,
} from '@europa/networking';
import { DEFAULT_GENERATION_SETTINGS, generateBoard } from '@europa/terrain';
import { expect, type Page, test } from '@playwright/test';

/**
 * Tick cadence for THIS spec. Must equal the match's tickIntervalMs
 * (`registerMatch` enforces it). Large on purpose — see module doc.
 */
const TICK_MS = 10_000;

/** Board edge: terrain placement constraints want the shipped default. */
const BOARD_SIZE = 32;

// ---------------------------------------------------------------------------
// Harness: lobby-style hosting with a duplicate-tolerant registration
// ---------------------------------------------------------------------------

/**
 * Wrap the server so matchmaking's auto-start `registerMatch` call is
 * absorbed when the harness ALREADY registered the session (lobby-host
 * style, pre-fill). Any other registration failure rethrows. Pure
 * forwarding for every other member (method spread).
 *
 * @param server The real match server (with bindMatchmaker attached).
 */
function tolerateDuplicateRegistration(server: Server): Server {
  return {
    ...server,
    registerMatch(req: RegisterMatchRequest): void {
      try {
        server.registerMatch(req);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        if (!message.includes('already registered')) {
          throw error;
        }
      }
    },
  };
}

/**
 * Build the engine session the way a lobby host would when it wants
 * the arena joinable BEFORE the roster fills (mirrors matchmaking's
 * engineSession.ts closure wrapper — the package barrel does not
 * export it, so the harness repeats the documented recipe inline).
 *
 * @param matchId The match to host.
 * @param seed Fixed seed (deterministic board).
 * @returns A `register` thunk that hands the session to the server.
 */
function buildLobbySession(
  matchId: MatchId,
  seed: number,
): { readonly register: (server: Server) => void } {
  const rng = createRng(seed);
  const generation = generateBoard({
    boardSize: BOARD_SIZE,
    playerCount: 2,
    seed,
    rng,
    settings: DEFAULT_GENERATION_SETTINGS,
  });
  const matchConfig: MatchConfig = Object.freeze({
    boardSize: BOARD_SIZE,
    playerCount: 2,
    tickIntervalMs: TICK_MS,
    seed,
    visibilityRadius: ENGINE_CONSTANTS.visibilityRadiusDefault,
  });
  let current = createWorld(matchConfig, generation.board);
  const engineSession: EngineSession = {
    world: () => current,
    submit(order) {
      const applied = applyCommand(current, order);
      current = applied.world;
      return applied.result;
    },
    advance() {
      const result = tick(current);
      current = result.world;
      // exactOptionalPropertyTypes: omit `terminal` rather than pass
      // an explicit undefined.
      if (result.terminal === undefined) {
        return { world: current, events: result.events };
      }
      return { world: current, events: result.events, terminal: result.terminal };
    },
    status: () => isTerminal(current),
    close: () => undefined,
  };
  return {
    register: (server: Server): void => {
      server.registerMatch({ matchId, engineSession, matchConfig });
    },
  };
}

// ---------------------------------------------------------------------------
// Browser-side helpers (same shape as full-stack.spec.ts)
// ---------------------------------------------------------------------------

/** Minimal mirror of the live runtime's window handle. */
interface LiveHandleView {
  readonly store: {
    getState(): {
      readonly status: string;
      readonly latestView: { readonly tick: number } | null;
    };
  };
  readonly client: { state(): { readonly connection: string } };
  bootError: string | null;
}

/** Poll a page until `when` holds (boot failures surface loudly). */
async function waitUntil(
  page: Page,
  when: (live: { status: string; tick: number }) => boolean,
  description: string,
): Promise<void> {
  await expect
    .poll(
      async () => {
        const live = await page.evaluate(() => {
          const handle = (window as unknown as { __europaLive?: LiveHandleView }).__europaLive;
          if (handle === undefined || handle.store === undefined) {
            return null;
          }
          const state = handle.store.getState();
          return {
            status: state.status,
            tick: state.latestView?.tick ?? -1,
            bootError: handle.bootError,
          };
        });
        if (live === null) {
          return false;
        }
        if (live.bootError !== null && live.bootError !== undefined) {
          throw new Error(`live runtime boot failed: ${String(live.bootError)}`);
        }
        return when(live);
      },
      { timeout: 20_000, intervals: [100, 250, 500] },
    )
    .toBe(true, description);
}

/** The waiting overlay root, by its stable data attribute. */
function overlay(page: Page): ReturnType<Page['locator']> {
  return page.locator('[data-europa-waiting="true"]');
}

// ---------------------------------------------------------------------------
// The proof
// ---------------------------------------------------------------------------

test('first console sees the waiting room while filling; auto-start clears it', async ({
  browser,
}) => {
  test.setTimeout(120_000);

  // -- Stack wiring (full-stack.spec.ts buildStack recipe + tolerance) --
  let bound: MatchmakerBridge = {};
  const forwardingBridge: MatchmakerBridge = {
    onSeatClaimed: (event) => bound.onSeatClaimed?.(event),
    onSeatDisconnected: (event) => bound.onSeatDisconnected?.(event),
    onSeatReconnected: (event) => bound.onSeatReconnected?.(event),
    onSeatExpired: (event) => bound.onSeatExpired?.(event),
    onMatchTerminal: (event) => bound.onMatchTerminal?.(event),
  };
  const deps: ServerDeps = {
    engine: {
      createMatchSession: () => {
        throw new Error('engine factory not used (harness pre-builds sessions)');
      },
    },
    fog: {
      computePlayerView: ({ world, playerId, spectator }) =>
        computePlayerView(world, playerId, { spectator }),
    },
    matchmaker: forwardingBridge,
    logger: NULL_LOGGER as Logger,
  };
  const server = createMatchServer(
    {
      ...NETWORK_DEFAULT_CONFIG,
      host: '127.0.0.1',
      port: 0,
      tickRateMs: TICK_MS,
      ordersPerSecond: 1000,
    },
    deps,
  );
  const bindable = Object.assign(server, {
    bindMatchmaker(bridge: MatchmakerBridge): void {
      bound = { ...bound, ...bridge };
    },
  });
  const matchmaker = createMatchmaker({}, { server: tolerateDuplicateRegistration(bindable) });

  await server.listen();
  const port = server.__boundPortForTest();
  expect(port).toBeDefined();

  try {
    // -- Create the match: seat 1 claimed, STILL FILLING -----------------
    const created = matchmaker.createMatch({
      visibility: 'public',
      displayName: 'Alice',
      settings: { playerCount: 2, boardSize: BOARD_SIZE, tickIntervalMs: TICK_MS },
    });
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }
    const matchId = created.data.matchId;
    // Matchmaking minted seat 1's token at create time; the harness
    // binds the SAME token on the wire so auto-start's attachPlayer is
    // an idempotent re-bind (never a seat theft) and Alice's URL can
    // carry it — exactly the host script's token-in-URL recipe.
    const aliceToken = created.data.seatAssignment.sessionToken;

    // Lobby-host style: register the arena pre-fill so the wire join
    // succeeds while the roster is incomplete (fixed seed ⇒ fixed
    // board), and bind seat 1 to Alice's matchmaking token.
    buildLobbySession(matchId, 2026_0823).register(server);
    server.attachPlayer({ matchId, playerId: 1 as PlayerId, sessionToken: aliceToken });

    // -- First console joins the UNFILLED match --------------------------
    const aliceContext = await browser.newContext();
    const alice = await aliceContext.newPage();
    await alice.goto(
      `/?live&ws=ws://127.0.0.1:${String(port)}&match=${encodeURIComponent(matchId)}&name=Alice&token=${aliceToken}`,
    );

    // Joined ('live') while the match is still filling…
    await waitUntil(alice, (live) => live.status === 'live', 'Alice reaches live');
    // …holding ONLY the tick-0 join snapshot (no broadcast yet).
    await waitUntil(alice, (live) => live.tick === 0, 'Alice holds the tick-0 join snapshot');

    // THE FIX: the waiting room is visible instead of a silent grid.
    await expect(overlay(alice)).toBeVisible();
    await expect(alice.locator('.europa-waiting__text')).toHaveText(
      'Waiting for opponent to join…',
    );

    // -- Second seat fills via matchmaking ⇒ auto-start ------------------
    const filled = matchmaker.joinMatch({ matchId, displayName: 'Bob' });
    expect(filled.ok).toBe(true);
    const bobToken = filled.data.seatAssignment.sessionToken;

    const bobContext = await browser.newContext();
    const bob = await bobContext.newPage();
    await bob.goto(
      `/?live&ws=ws://127.0.0.1:${String(port)}&match=${encodeURIComponent(matchId)}&name=Bob&token=${bobToken}`,
    );
    await waitUntil(bob, (live) => live.status === 'live', 'Bob reaches live');

    // -- Ticks flow to BOTH seats; the overlay retires on each ----------
    await waitUntil(alice, (live) => live.tick >= 1, 'Alice receives the first broadcast');
    await waitUntil(bob, (live) => live.tick >= 1, 'Bob receives the first broadcast');
    await expect(overlay(alice)).toHaveCount(0);
    await expect(overlay(bob)).toHaveCount(0);

    await aliceContext.close();
    await bobContext.close();
  } finally {
    await server.close();
    await matchmaker.close();
  }
});
