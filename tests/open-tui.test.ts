import assert from "node:assert/strict";
import test from "node:test";
import {
	beginOpenTuiInteraction,
	OPEN_TUI_SPINNER_OVERRIDE_EVENT,
	OPEN_TUI_WAITING_MESSAGE,
} from "../extensions/ask-user-question/open-tui.ts";

test("emits idempotent pi-open-tui spinner override and clear events", () => {
	const emitted: Array<{ channel: string; data: unknown }> = [];
	const events = {
		emit(channel: string, data: unknown) {
			emitted.push({ channel, data });
		},
	} as never;
	const release = beginOpenTuiInteraction(events, "tool-1");
	release();
	release();
	assert.equal(emitted.length, 2);
	assert.equal(emitted[0]?.channel, OPEN_TUI_SPINNER_OVERRIDE_EVENT);
	assert.deepEqual(
		emitted.map((entry) => (entry.data as { message: string | null }).message),
		[OPEN_TUI_WAITING_MESSAGE, null],
	);
	assert.deepEqual(
		emitted.map((entry) => (entry.data as { scope: string }).scope),
		["agent", "agent"],
	);
});
