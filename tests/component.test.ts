import assert from "node:assert/strict";
import test from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import { AskUserQuestionComponent } from "../extensions/ask-user-question/component.ts";
import { sampleQuestions } from "./helpers.ts";

const theme = {
	fg: (_color: string, text: string) => text,
	bg: (_color: string, text: string) => text,
	bold: (text: string) => text,
};

const keybindings = {
	matches(data: string, binding: string) {
		const values: Record<string, string[]> = {
			"tui.select.up": ["\x1b[A"],
			"tui.select.down": ["\x1b[B"],
			"tui.select.confirm": ["\r"],
			"tui.select.cancel": ["\x1b"],
			"tui.input.tab": ["\t"],
		};
		return values[binding]?.includes(data) ?? false;
	},
};

test("renders within narrow terminal widths", () => {
	const tui = { requestRender() {} };
	const component = new AskUserQuestionComponent({
		tui: tui as never,
		theme: theme as never,
		keybindings: keybindings as never,
		questions: sampleQuestions(),
		onDone() {},
	});
	for (const width of [24, 32, 36, 60, 80]) {
		for (const line of component.render(width)) {
			assert.ok(visibleWidth(line) <= width, `${visibleWidth(line)} > ${width}: ${line}`);
		}
	}
});

test("single-choice Enter completes a one-question interaction", () => {
	let outcome = "";
	const component = new AskUserQuestionComponent({
		tui: { requestRender() {} } as never,
		theme: theme as never,
		keybindings: keybindings as never,
		questions: [sampleQuestions()[0]!],
		onDone(result) { outcome = result.outcome; },
	});
	component.handleInput("\r");
	assert.equal(outcome, "answered");
});

test("Other opens an inline editor and submits custom text", () => {
	let answer = "";
	const component = new AskUserQuestionComponent({
		tui: { requestRender() {} } as never,
		theme: theme as never,
		keybindings: keybindings as never,
		questions: [sampleQuestions()[0]!],
		onDone(result) { answer = result.answers[0]?.customText ?? ""; },
	});
	component.handleInput("\x1b[B");
	component.handleInput("\x1b[B");
	component.handleInput("\r");
	for (const character of "DuckDB") component.handleInput(character);
	component.handleInput("\r");
	assert.equal(answer, "DuckDB");
});

test("respects a custom KeybindingsManager confirm binding", () => {
	let outcome = "";
	const component = new AskUserQuestionComponent({
		tui: { requestRender() {} } as never,
		theme: theme as never,
		keybindings: {
			matches(data: string, binding: string) {
				return binding === "tui.select.confirm" && data === "x";
			},
		} as never,
		questions: [sampleQuestions()[0]!],
		onDone(result) { outcome = result.outcome; },
	});
	component.handleInput("x");
	assert.equal(outcome, "answered");
});
