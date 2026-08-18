import assert from "node:assert/strict";
import test from "node:test";
import {
	buildAskUserQuestionDetails,
	formatCompactResult,
	formatModelFacingResult,
} from "../extensions/ask-user-question/result.ts";
import { sampleQuestions } from "./helpers.ts";

test("formats structured single and multi answers for the model", () => {
	const questions = sampleQuestions();
	const details = buildAskUserQuestionDetails(questions, {
		outcome: "answered",
		answers: [
			{
				questionIndex: 0,
				question: questions[0]!.question,
				header: questions[0]!.header,
				selectedLabels: ["PostgreSQL"],
			},
			{
				questionIndex: 1,
				question: questions[1]!.question,
				header: questions[1]!.header,
				selectedLabels: ["Logging", "Metrics"],
				customText: "Tracing",
			},
		],
	});
	const text = formatModelFacingResult(details);
	assert.match(text, /Answer: PostgreSQL/);
	assert.match(text, /Answers:\n  - Logging\n  - Metrics\n  - Custom: Tracing/);
	assert.deepEqual(formatCompactResult(details), [
		"Database → PostgreSQL",
		"Features → Logging, Metrics, Custom: Tracing",
	]);
});

test("clarify result explicitly avoids treating partial selections as accepted", () => {
	const questions = sampleQuestions();
	const details = buildAskUserQuestionDetails(questions, {
		outcome: "clarify",
		answers: [],
		reason: "Discuss first",
	});
	const text = formatModelFacingResult(details);
	assert.match(text, /Do not treat any option as accepted yet/);
	assert.match(text, /No partial answers were selected/);
});

test("unavailable results retain unanswered indexes", () => {
	const questions = sampleQuestions();
	const details = buildAskUserQuestionDetails(questions, {
		outcome: "unavailable",
		answers: [],
		reason: "print mode",
	});
	assert.deepEqual(details.unansweredQuestionIndexes, [0, 1]);
	assert.match(formatModelFacingResult(details), /print mode/);
});
