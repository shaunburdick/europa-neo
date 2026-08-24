/**
 * Console tunable constants + defaults — Feature 005 (T019).
 *
 * Single import point for every tunable number and default table the
 * console uses. Per PM Directive #1, the VALUES live in the contract
 * mirrors (`contracts/console-api.ts` §"Constants" and
 * `contracts/console-types.ts`), which are byte-identical to the
 * source-of-truth spec contracts under
 * `.specify/features/005-client-console/contracts/`. This module
 * re-exports them instead of redeclaring, so there is exactly one
 * place a constant can drift: the contract itself.
 *
 * Values (data-model.md §15 / tasks.md T019):
 *   - defaultCellPx 32 · minCellPx 12 · maxCellPx 96 (camera clamp)
 *   - feedbackTtlMs 2000 · labelTtlMs 1500 · effectTtlMs 400 (transient TTLs)
 *   - maxFeedbackMessages 5 · maxRejectedOrders 10 (FIFO caps)
 *   - clientOrderRatePerSec 10 (client-side debounce hint)
 *   - reconnectBackoffBaseMs 500 · reconnectBackoffCapMs 30000
 */

export { CONSOLE_CONSTANTS } from '../contracts/console-api';

export {
    CONSOLE_API_VERSION,
    DEFAULT_CAMERA,
    DEFAULT_INPUT_MAPPING,
    DEFAULT_PLAYER_COLORS,
    DEFAULT_QOL_SETTINGS,
    SUBCELL_RANGE,
} from '../contracts/console-types';
