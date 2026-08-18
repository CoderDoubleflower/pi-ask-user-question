import assert from "node:assert/strict";
import test from "node:test";
import { registerAskUserQuestion } from "../extensions/ask-user-question/index.ts";

function input() {
	return {
		questions: [{
			question: "Which database?",
			header: "Database",
			options: [
				{ label: "SQLite", description: "Embedded" },
				{ label: "PostgreSQL", description: "Server" },
			],
		}],
	};
}

function setup() {
	let tool: any;
	let shutdown: (() => void) | undefined;
	const emitted: Array<{ channel: string; data: any }> = [];
	const pi = {
		events: {
			emit(channel: string, data: unknown) { emitted.push({ channel, data }); },
			on() { return () => {}; },
		},
		on(event: string, handler: () => void) {
			if (event === "session_shutdown") shutdown = handler;
		},
		registerTool(value: unknown) { tool = value; },
	};
	registerAskUserQuestion(pi as never);
	return { tool, shutdown, emitted };
}

test("registers a sequential interactive tool", () => {
	const { tool } = setup();
	assert.equal(tool.name, "ask_user_question");
	assert.equal(tool.executionMode, "sequential");
});

test("executes the TUI interaction and balances open-tui events", async () => {
	const { tool, emitted } = setup();
	const result = await tool.execute(
		"tool-1",
		input(),
		undefined,
		undefined,
		{
			mode: "tui",
			hasUI: true,
			ui: {
				custom(factory: any) {
					return new Promise((resolve) => {
						const component = factory(
							{ requestRender() {} },
							{ fg: (_c: string, s: string) => s, bg: (_c: string, s: string) => s, bold: (s: string) => s },
							{ matches: (data: string, binding: string) => binding === "tui.select.confirm" && data === "\r" },
							resolve,
						);
						component.handleInput("\r");
					});
			},
		},
		},
	);
	assert.equal(result.details.outcome, "answered");
	assert.match(result.content[0].text, /Answer: SQLite/);
	assert.deepEqual(emitted.map((entry) => entry.data.message), ["Waiting for your answer", null]);
});

test("returns unavailable outside TUI mode without emitting integration events", async () => {
	const { tool, emitted } = setup();
	const result = await tool.execute(
		"tool-1",
		input(),
		undefined,
		undefined,
		{ mode: "print", hasUI: false, ui: {} },
	);
	assert.equal(result.details.outcome, "unavailable");
	assert.equal(emitted.length, 0);
});

test("returns cancelled immediately when the tool signal is already aborted", async () => {
	const { tool, emitted } = setup();
	const controller = new AbortController();
	controller.abort();
	const result = await tool.execute(
		"tool-aborted",
		input(),
		controller.signal,
		undefined,
		{ mode: "tui", hasUI: true, ui: { custom() { throw new Error("must not mount"); } } },
	);
	assert.equal(result.details.outcome, "cancelled");
	assert.equal(emitted.length, 0);
});

test("AbortSignal closes an active questionnaire and clears the spinner override", async () => {
	const { tool, emitted } = setup();
	const controller = new AbortController();
	let mounted = false;
	const promise = tool.execute(
		"tool-abort-active",
		input(),
		controller.signal,
		undefined,
		{
			mode: "tui",
			hasUI: true,
			ui: {
				custom(factory: any) {
					return new Promise((resolve) => {
						factory(
							{ requestRender() {} },
							{ fg: (_c: string, s: string) => s, bg: (_c: string, s: string) => s, bold: (s: string) => s },
							{ matches: () => false },
							resolve,
						);
						mounted = true;
					});
				},
			},
		},
	);
	assert.equal(mounted, true);
	controller.abort();
	const result = await promise;
	assert.equal(result.details.outcome, "cancelled");
	assert.deepEqual(emitted.map((entry) => entry.data.message), ["Waiting for your answer", null]);
});

test("session shutdown closes an active questionnaire", async () => {
	const { tool, emitted, shutdown } = setup();
	let mounted = false;
	const promise = tool.execute(
		"tool-shutdown",
		input(),
		undefined,
		undefined,
		{
			mode: "tui",
			hasUI: true,
			ui: {
				custom(factory: any) {
					return new Promise((resolve) => {
						factory(
							{ requestRender() {} },
							{ fg: (_c: string, s: string) => s, bg: (_c: string, s: string) => s, bold: (s: string) => s },
							{ matches: () => false },
							resolve,
						);
						mounted = true;
					});
				},
			},
		},
	);
	assert.equal(mounted, true);
	shutdown?.();
	const result = await promise;
	assert.equal(result.details.outcome, "cancelled");
	assert.match(result.details.reason, /session ended/i);
	assert.deepEqual(emitted.map((entry) => entry.data.message), ["Waiting for your answer", null]);
});

test("UI construction failures return unavailable and release integration state", async () => {
	const { tool, emitted } = setup();
	const result = await tool.execute(
		"tool-ui-error",
		input(),
		undefined,
		undefined,
		{
			mode: "tui",
			hasUI: true,
			ui: { custom() { throw new Error("broken UI"); } },
		},
	);
	assert.equal(result.details.outcome, "unavailable");
	assert.match(result.details.reason, /broken UI/);
	assert.deepEqual(emitted.map((entry) => entry.data.message), ["Waiting for your answer", null]);
});

test("an abort-related UI rejection is reported as cancellation", async () => {
	const { tool, emitted } = setup();
	const controller = new AbortController();
	const promise = tool.execute(
		"tool-abort-reject",
		input(),
		controller.signal,
		undefined,
		{
			mode: "tui",
			hasUI: true,
			ui: {
				custom() {
					return new Promise((_resolve, reject) => {
						controller.signal.addEventListener("abort", () => reject(new Error("aborted UI")), { once: true });
					});
				},
			},
		},
	);
	controller.abort();
	const result = await promise;
	assert.equal(result.details.outcome, "cancelled");
	assert.match(result.details.reason, /aborted/i);
	assert.deepEqual(emitted.map((entry) => entry.data.message), ["Waiting for your answer", null]);
});
