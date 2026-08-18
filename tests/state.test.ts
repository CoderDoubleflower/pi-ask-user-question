import assert from "node:assert/strict";
import test from "node:test";
import { AskUserQuestionMachine } from "../extensions/ask-user-question/state.ts";
import { sampleQuestions } from "./helpers.ts";

test("single-select answers advance to the next question", () => {
	const machine = new AskUserQuestionMachine(sampleQuestions());
	const effect = machine.confirm();
	assert.equal(effect.type, "none");
	assert.equal(machine.currentQuestionIndex, 1);
	assert.deepEqual(machine.getAnswers()[0]?.selectedLabels, ["SQLite"]);
});

test("a single single-select question auto-submits", () => {
	const machine = new AskUserQuestionMachine([sampleQuestions()[0]!]);
	machine.moveVertical(1);
	const effect = machine.confirm();
	assert.equal(effect.type, "complete");
	if (effect.type !== "complete") return;
	assert.equal(effect.result.outcome, "answered");
	assert.deepEqual(effect.result.answers[0]?.selectedLabels, ["PostgreSQL"]);
});

test("multi-select toggles choices and requires an answer before advancing", () => {
	const machine = new AskUserQuestionMachine([sampleQuestions()[1]!]);
	machine.moveVertical(1);
	machine.moveVertical(1);
	machine.moveVertical(1);
	assert.equal(machine.currentRow.kind, "primary");
	machine.confirm();
	assert.match(machine.warning ?? "", /Select at least one/);

	machine.moveVertical(-1);
	machine.moveVertical(-1);
	assert.equal(machine.currentRow.kind, "option");
	machine.confirm();
	assert.deepEqual(machine.currentQuestionState.selectedLabels, ["Metrics"]);
	machine.moveVertical(1);
	machine.moveVertical(1);
	const effect = machine.confirm();
	assert.equal(effect.type, "none");
	assert.equal(machine.screen, "review");
});

test("custom answers are saved and can coexist with multi-select choices", () => {
	const machine = new AskUserQuestionMachine([sampleQuestions()[1]!]);
	machine.confirm();
	machine.moveVertical(1);
	machine.moveVertical(1);
	assert.equal(machine.currentRow.kind, "other");
	const open = machine.confirm();
	assert.equal(open.type, "open-other");
	const submit = machine.submitOther("OpenTelemetry export");
	assert.equal(submit.type, "none");
	const answer = machine.getAnswers()[0]!;
	assert.deepEqual(answer.selectedLabels, ["Logging"]);
	assert.equal(answer.customText, "OpenTelemetry export");
});

test("Escape from custom input returns to choices without cancelling", () => {
	const machine = new AskUserQuestionMachine([sampleQuestions()[0]!]);
	machine.moveVertical(1);
	machine.moveVertical(1);
	machine.confirm();
	assert.equal(machine.screen, "other-input");
	machine.cancelOther();
	assert.equal(machine.screen, "question");
	assert.equal(machine.getAnswers().length, 0);
});

test("review sends users to the first unanswered question", () => {
	const machine = new AskUserQuestionMachine(sampleQuestions());
	machine.nextTab();
	machine.nextTab();
	assert.equal(machine.screen, "review");
	const effect = machine.confirm();
	assert.equal(effect.type, "none");
	assert.equal(machine.screen, "question");
	assert.equal(machine.currentQuestionIndex, 0);
});

test("Chat about this returns partial answers without accepting them", () => {
	const machine = new AskUserQuestionMachine(sampleQuestions());
	machine.confirm();
	assert.equal(machine.currentQuestionIndex, 1);
	for (let i = 0; i < 4; i++) machine.moveVertical(1);
	assert.equal(machine.currentRow.kind, "chat");
	const effect = machine.confirm();
	assert.equal(effect.type, "complete");
	if (effect.type !== "complete") return;
	assert.equal(effect.result.outcome, "clarify");
	assert.equal(effect.result.answers.length, 1);
});

test("a multi-select custom answer can be cleared by submitting an empty editor", () => {
	const machine = new AskUserQuestionMachine([sampleQuestions()[1]!]);
	machine.moveVertical(1);
	machine.moveVertical(1);
	machine.confirm();
	machine.submitOther("Tracing");
	assert.equal(machine.getAnswers()[0]?.customText, "Tracing");
	machine.confirm();
	assert.equal(machine.screen, "other-input");
	machine.submitOther("   ");
	assert.equal(machine.screen, "question");
	assert.equal(machine.getAnswers().length, 0);
});
