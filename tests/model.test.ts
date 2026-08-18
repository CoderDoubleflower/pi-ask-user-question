import assert from "node:assert/strict";
import test from "node:test";
import { normalizeAskUserQuestionParams } from "../extensions/ask-user-question/model.ts";

test("normalizes whitespace and defaults multiSelect to false", () => {
	const result = normalizeAskUserQuestionParams({
		questions: [
			{
				question: "  Which   database?  ",
				header: " Database ",
				options: [
					{ label: " SQLite ", description: " Embedded   database " },
					{ label: " PostgreSQL ", description: " Server database " },
				],
			},
		],
	});
	assert.equal(result.ok, true);
	if (!result.ok) return;
	assert.equal(result.questions[0]?.question, "Which database?");
	assert.equal(result.questions[0]?.multiSelect, false);
	assert.equal(result.questions[0]?.options[0]?.description, "Embedded database");
});

test("rejects duplicate question texts after canonicalization", () => {
	const result = normalizeAskUserQuestionParams({
		questions: [
			{
				question: "Which database?",
				header: "A",
				options: [
					{ label: "One", description: "First" },
					{ label: "Two", description: "Second" },
				],
			},
			{
				question: " which database? ",
				header: "B",
				options: [
					{ label: "Three", description: "Third" },
					{ label: "Four", description: "Fourth" },
				],
			},
		],
	});
	assert.deepEqual(result, { ok: false, error: "question texts must be unique" });
});

test("rejects duplicate and reserved option labels", () => {
	const duplicate = normalizeAskUserQuestionParams({
		questions: [{
			question: "Choose?",
			header: "Choose",
			options: [
				{ label: "One", description: "First" },
				{ label: " one ", description: "Duplicate" },
			],
		}],
	});
	assert.equal(duplicate.ok, false);

	const reserved = normalizeAskUserQuestionParams({
		questions: [{
			question: "Choose?",
			header: "Choose",
			options: [
				{ label: "Other", description: "Reserved" },
				{ label: "Two", description: "Second" },
			],
		}],
	});
	assert.equal(reserved.ok, false);
});

test("rejects control characters and invalid cardinality", () => {
	const control = normalizeAskUserQuestionParams({
		questions: [{
			question: "Choose?\u001b[31m",
			header: "Choose",
			options: [
				{ label: "One", description: "First" },
				{ label: "Two", description: "Second" },
			],
		}],
	});
	assert.equal(control.ok, false);

	const cardinality = normalizeAskUserQuestionParams({ questions: [] });
	assert.deepEqual(cardinality, { ok: false, error: "questions must contain 1-4 questions" });
});
