import type {
	AskUserQuestion,
	AskUserQuestionAnswer,
	AskUserQuestionDetails,
	AskUserQuestionInteractionResult,
	AskUserQuestionOutcome,
} from "./types.ts";

function answerValues(answer: AskUserQuestionAnswer): string[] {
	const values = [...answer.selectedLabels];
	if (answer.customText) values.push(`Custom: ${answer.customText}`);
	return values;
}

export function buildAskUserQuestionDetails(
	questions: readonly AskUserQuestion[],
	result: AskUserQuestionInteractionResult | { outcome: "unavailable"; reason: string; answers?: AskUserQuestionAnswer[] },
): AskUserQuestionDetails {
	const answers = result.answers ?? [];
	const answered = new Set(answers.map((answer) => answer.questionIndex));
	return {
		outcome: result.outcome,
		questions: [...questions],
		answers,
		unansweredQuestionIndexes: questions
			.map((_, index) => index)
			.filter((index) => !answered.has(index)),
		...(result.reason ? { reason: result.reason } : {}),
	};
}

function formatShownQuestions(questions: readonly AskUserQuestion[]): string {
	return questions.map((question) => `- ${question.question}`).join("\n");
}

function formatPartialAnswers(answers: readonly AskUserQuestionAnswer[]): string {
	if (answers.length === 0) return "- No partial answers were selected.";
	return answers
		.map((answer) => {
			const values = answerValues(answer);
			return `- ${answer.header}: ${values.length > 0 ? values.join(", ") : "No answer"}`;
		})
		.join("\n");
}

export function formatModelFacingResult(details: AskUserQuestionDetails): string {
	switch (details.outcome) {
		case "answered": {
			const sections = details.answers.map((answer) => {
				const values = answerValues(answer);
				if (values.length <= 1) {
					return `- "${answer.question}"\n  Answer: ${values[0] ?? "No answer"}`;
				}
				return `- "${answer.question}"\n  Answers:\n${values.map((value) => `  - ${value}`).join("\n")}`;
			});
			return [
				"The user answered the questions:",
				"",
				sections.join("\n\n"),
				"",
				"Continue with these answers in mind.",
			].join("\n");
		}
		case "clarify":
			return [
				"The user wants to discuss these questions before answering.",
				"Do not treat any option as accepted yet. Ask what the user would like to clarify.",
				"After the discussion, invoke ask_user_question again only if structured choices are still useful.",
				"",
				"Questions shown:",
				formatShownQuestions(details.questions),
				"",
				"Partial selections:",
				formatPartialAnswers(details.answers),
			].join("\n");
		case "cancelled":
			return [
				"The user declined to answer these questions.",
				"Do not immediately repeat the same questionnaire.",
				"Continue with a safe default when possible, or ask one essential question in plain language if proceeding would otherwise be unsafe.",
			].join("\n");
		case "unavailable":
			return [
				"Interactive questionnaire UI is unavailable in this run mode.",
				"Ask the essential question directly in the assistant response instead.",
				details.reason ? `Reason: ${details.reason}` : "",
			].filter(Boolean).join("\n");
	}
}

export function formatCompactResult(details: AskUserQuestionDetails): string[] {
	if (details.outcome === "answered") {
		return details.answers.map((answer) => {
			const values = answerValues(answer);
			return `${answer.header} → ${values.join(", ")}`;
		});
	}
	const labels: Record<Exclude<AskUserQuestionOutcome, "answered">, string> = {
		clarify: "User wants to discuss the questions",
		cancelled: "User declined to answer",
		unavailable: "Interactive UI unavailable",
	};
	return [labels[details.outcome]];
}
