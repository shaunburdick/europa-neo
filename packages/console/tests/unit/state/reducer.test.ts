/**
 * Reducer unit tests — Feature 005 (Q-U01/Q-U02, T097 coverage).
 *
 * Drives every `PlayerAction` and `NetEvent` arm of the pure reducer
 * plus the invariants (data-model.md §17): inputEnabled ⟺ live,
 * monotonic ticks, feedback TTL/FIFO caps, rejection history caps.
 * Pure: every dispatch passes an explicit `nowMs`.
 */

import { describe, expect, it } from 'vitest';

import { CONSOLE_CONSTANTS, DEFAULT_CAMERA } from '../../../src/config';
import {
  allocateActionId,
  appendFeedback,
  appendRejection,
  INITIAL_CONSOLE_STATE,
  reduce,
} from '../../../src/state/reducer';
import type { ConsoleState, PlayerAction, PlayerView } from '../../../src/state/types';

const NOW = 10_000;

/** Live seated state (the only shape that can issue orders). */
function live(): ConsoleState {
  return {
    ...INITIAL_CONSOLE_STATE,
    status: 'live',
    inputEnabled: true,
    latestView: view(1),
    session: { ...INITIAL_CONSOLE_STATE.session, playerId: 1 },
  };
}

/** Minimal fog view at a given tick. */
function view(tick: number): PlayerView {
  return {
    player: 1,
    tick,
    visibleCells: [],
    events: { combat: [], captures: [], eliminations: [], appliedOrders: [], errors: [] },
    config: { boardSize: 16, playerCount: 2, tickIntervalMs: 250, seed: 0, visibilityRadius: 2 },
  };
}

/** Step `state` with a fixed clock. */
function step(state: ConsoleState, action: Parameters<typeof reduce>[1], nowMs = NOW) {
  return reduce(state, action, { nowMs });
}

describe('reducer: PlayerAction arms (Q-U01)', () => {
  it('order-producing gestures require live status — dropped otherwise', () => {
    const idle = INITIAL_CONSOLE_STATE;
    const { state, effects } = step(idle, {
      kind: 'setPipe',
      cell: { x: 1, y: 1 },
      direction: 'N',
    });
    expect(state).toEqual(idle); // semantically untouched
    expect(effects).toEqual([]);
  });

  it('order-producing gestures require a seat — dropped for spectators', () => {
    const spectating = { ...live(), session: { ...live().session, playerId: null } };
    const { effects } = step(spectating, { kind: 'setReserves', cell: { x: 0, y: 0 }, percent: 3 });
    expect(effects).toEqual([]);
  });

  it.each([
    { kind: 'setPipe', cell: { x: 1, y: 2 }, direction: 'N' },
    { kind: 'clearPipe', cell: { x: 1, y: 2 }, direction: 'E' },
    { kind: 'setPipesExclusive', cell: { x: 1, y: 2 }, direction: 'S' },
    { kind: 'clearAllPipes', cell: { x: 1, y: 2 } },
    { kind: 'setReserves', cell: { x: 1, y: 2 }, percent: 7 },
    { kind: 'paratroop', source: { x: 1, y: 2 }, target: { x: 3, y: 2 } },
    { kind: 'gun', source: { x: 1, y: 2 }, target: { x: 3, y: 4 } },
    { kind: 'surrender' },
  ] as readonly PlayerAction[])('%s produces sendOrder + announce + confirmation', (action) => {
    const { state, effects } = step(live(), action);
    expect(effects).toHaveLength(2);
    expect(effects[0]?.kind).toBe('sendOrder');
    if (effects[0]?.kind === 'sendOrder') {
      expect(effects[0].order.player).toBe(1);
      expect(effects[0].actionId).toBeGreaterThan(0);
    }
    expect(effects[1]).toEqual({
      kind: 'announce',
      text: state.feedback.at(-1)?.text,
      politeness: 'polite',
    });
    expect(state.feedback).toHaveLength(1);
    expect(state.feedback[0]?.kind).toBe('info');
  });

  it('selectCell / hoverCell / setExclusiveMode are local-only', () => {
    const s1 = step(live(), { kind: 'selectCell', cell: { x: 4, y: 5 } }).state;
    expect(s1.selection).toEqual({ x: 4, y: 5 });
    const s2 = step(s1, { kind: 'hoverCell', cell: { x: 6, y: 7 } }).state;
    expect(s2.hover).toEqual({ x: 6, y: 7 });
    const s3 = step(s2, { kind: 'setExclusiveMode', enabled: true }).state;
    expect(s3.exclusiveMode).toBe(true);
    for (const result of [s1, s2, s3]) {
      expect(result.feedback).toHaveLength(0);
    }
  });

  it('setCamera replaces the camera; setQol merges and persists', () => {
    const camera = { ...DEFAULT_CAMERA, zoom: 48 };
    const s1 = step(live(), { kind: 'setCamera', camera }).state;
    expect(s1.camera.zoom).toBe(48);
    const { state, effects } = step(s1, { kind: 'setQol', patch: { gridlines: false } });
    expect(state.qol.gridlines).toBe(false);
    expect(state.qol.ownerColorRing).toBe(INITIAL_CONSOLE_STATE.qol.ownerColorRing);
    expect(effects).toEqual([{ kind: 'persistQol', settings: state.qol }]);
  });
});

describe('reducer: NetEvent arms (Q-U02)', () => {
  it('connecting sets status + matchId; helloAck is a no-op', () => {
    const s1 = step(INITIAL_CONSOLE_STATE, { kind: 'connecting', matchId: 'm-1' }).state;
    expect(s1.status).toBe('connecting');
    expect(s1.session.matchId).toBe('m-1');
    const s2 = step(s1, {
      kind: 'helloAck',
      connectionId: 'c-1',
      heartbeatIntervalMs: 5000,
    }).state;
    expect(s2.status).toBe('connecting'); // still awaiting join
  });

  it('joined goes live, seeds the view and opponents', () => {
    const { state } = step(step(live(), { kind: 'connecting', matchId: 'm-1' }).state, {
      kind: 'joined',
      sessionToken: 'tok' as never,
      playerId: 2,
      view: view(9),
      players: [
        { id: 1, displayName: 'A' },
        { id: 2, displayName: 'B' },
      ],
    });
    expect(state.status).toBe('live');
    expect(state.inputEnabled).toBe(true);
    expect(state.latestView?.tick).toBe(9);
    expect(state.session.opponents).toEqual(['A']);
  });

  it('drops out-of-order ticks, accepts equal-or-newer ones', () => {
    const seeded = { ...live(), latestView: view(50) };
    const dropped = step(seeded, { kind: 'tick', view: view(49) });
    expect(dropped.state.latestView?.tick).toBe(50);
    expect(dropped.effects).toEqual([]);
    const accepted = step(seeded, { kind: 'tick', view: view(51) }).state;
    expect(accepted.latestView?.tick).toBe(51);
  });

  it('orderAck ok acknowledges; rejection records history + assertive announce', () => {
    // Produce a real pending order so the correlation table has it.
    const sent = step(live(), { kind: 'setReserves', cell: { x: 2, y: 3 }, percent: 4 });
    const actionId = sent.effects[0]?.kind === 'sendOrder' ? sent.effects[0].actionId : -1;

    const ok = step(sent.state, { kind: 'orderAck', actionId, result: { ok: true } });
    expect(ok.state.feedback.at(-1)?.text).toContain('acknowledged');

    const rejected = step(live(), { kind: 'setReserves', cell: { x: 2, y: 3 }, percent: 4 });
    const rejectId = rejected.effects[0]?.kind === 'sendOrder' ? rejected.effects[0].actionId : -1;
    const bad = step(rejected.state, {
      kind: 'orderAck',
      actionId: rejectId,
      result: { ok: false, reason: 'not_owner' as never },
    });
    expect(bad.state.rejectedOrders).toHaveLength(1);
    expect(bad.state.rejectedOrders[0]?.reason).toBe('not_owner');
    expect(bad.state.feedback.at(-1)?.kind).toBe('warning');
    expect(bad.effects).toEqual([
      { kind: 'announce', text: bad.state.feedback.at(-1)?.text, politeness: 'assertive' },
    ]);
  });

  it('terminal ends the match; socketClosed/reconnecting surface the gap', () => {
    const over = step(live(), {
      kind: 'terminal',
      result: { winner: 2, reason: 'conquest' as never },
    }).state;
    expect(over.status).toBe('game_over');
    expect(over.inputEnabled).toBe(false);

    const closed = step(live(), { kind: 'socketClosed', code: 1006, reason: 'abnormal' }).state;
    expect(closed.status).toBe('reconnecting');

    const { state, effects } = step(closed, {
      kind: 'reconnecting',
      attempt: 2,
      nextRetryMs: 750,
    });
    expect(state.status).toBe('reconnecting');
    expect(effects).toEqual([{ kind: 'scheduleReconnect', delayMs: 750 }]);
  });

  it('error events land in feedback with an assertive announcement', () => {
    const { state, effects } = step(live(), {
      kind: 'error',
      code: 'match_full' as never,
      message: 'no seats',
    });
    expect(state.feedback.at(-1)?.kind).toBe('error');
    expect(state.feedback.at(-1)?.text).toContain('match_full');
    expect(effects[0]).toMatchObject({ kind: 'announce', politeness: 'assertive' });
  });
});

describe('reducer invariants (data-model §17)', () => {
  it('inputEnabled ⟺ status live after EVERY step', () => {
    let state = live();
    for (const event of [
      { kind: 'socketClosed', code: 1006, reason: 'x' },
      { kind: 'pong', clientTimeMs: 1, serverTimeMs: 2 },
      { kind: 'terminal', result: { winner: 1, reason: 'conquest' as never } },
    ] as const) {
      ({ state } = step(state, event));
      expect(state.inputEnabled).toBe(state.status === 'live');
    }
  });

  it('feedback is TTL-cleaned lazily and FIFO-capped', () => {
    let queue = INITIAL_CONSOLE_STATE.feedback;
    for (let i = 0; i < CONSOLE_CONSTANTS.maxFeedbackMessages + 3; i += 1) {
      queue = appendFeedback(queue, { text: `m${i}`, kind: 'info', ttlMs: 1000 }, NOW + i);
    }
    expect(queue).toHaveLength(CONSOLE_CONSTANTS.maxFeedbackMessages);
    expect(queue.at(-1)?.text).toBe(`m${CONSOLE_CONSTANTS.maxFeedbackMessages + 2}`);
    // Entries strictly older than their ttl disappear on the next
    // append; boundary-age entries (age === ttl) survive.
    const expired = appendFeedback(
      queue,
      { text: 'fresh', kind: 'info', ttlMs: 1000 },
      NOW + CONSOLE_CONSTANTS.maxFeedbackMessages + 1001,
    );
    expect(expired.map((message) => message.text)).toEqual(['m6', 'm7', 'fresh']);
  });

  it('rejectedOrders are FIFO-capped', () => {
    let rejections: ConsoleState['rejectedOrders'] = [];
    for (let i = 0; i < CONSOLE_CONSTANTS.maxRejectedOrders + 5; i += 1) {
      rejections = appendRejection(
        rejections,
        {
          actionId: i + 1,
          order: { kind: 'surrender', player: 1 },
          reason: 'not_owner' as never,
          atTick: i,
        },
        NOW,
      );
    }
    expect(rejections).toHaveLength(CONSOLE_CONSTANTS.maxRejectedOrders);
    expect(rejections[0]?.actionId).toBe(6); // oldest evicted
  });
});

describe('allocateActionId (T087 seam)', () => {
  it('issues strictly increasing unique ids', () => {
    const a = allocateActionId();
    const b = allocateActionId();
    const c = allocateActionId();
    expect(b).toBe(a + 1);
    expect(c).toBe(b + 1);
  });
});
