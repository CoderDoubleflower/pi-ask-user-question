import type {
	AskUserQuestion,
	AskUserQuestionInput,
	AskUserQuestionParamsInput,
} from "./types.ts";

const CONTROL_CHARACTER = /[\u0000-\u001f\u007f-\u009f]/u;
const RESERVED_OPTION_LABELS = new Set(["__other__", "other", "type something", "type something."]);
const MAX_TOTAL_CODE_POINTS = 16_000;

export type NormalizeResult =
	| { ok: true; questions: AskUserQuestion[] }
	| { ok: false; error: string };

function codePointLength(value: string): number {
	return Array.from(value).length;
}

function canonicalize(value: string): string {
	return value.normalize("NFKC").trim().toLocaleLowerCase("en-US");
}

function normalizeSingleLine(
	value: unknown,
	field: string,
	maxCodePoints: number,
): { ok: true; value: string } | { ok: false; error: string } {
	if (typeof value !== "string") return { ok: false, error: `${field} must be a string` };
	const normalized = value.normalize("NFC").trim().replace(/\s+/gu, " ");
	if (normalized.length === 0) return { ok: false, error: `${field} must not be empty` };
	if (CONTROL_CHARACTER.test(normalized)) return { ok: false, error: `${field} contains control characters` };
	if (codePointLength(normalized) > maxCodePoints) {
		return { ok: false, error: `${field} exceeds ${maxCodePoints} characters` };
	}
	return { ok: true, value: normalized };
}

function normalizeQuestion(
	input: AskUserQuestionInput,
	questionIndex: number,
): { ok: true; question: AskUserQuestion; codePoints: number } | { ok: false; error: string } {
	const prefix = `questions[${questionIndex}]`;
	const question = normalizeSingleLine(input.question, `${prefix}.question`, 500);
	if (!question.ok) return question;
	const header = normalizeSingleLine(input.header, `${prefix}.header`, 40);
	if (!header.ok) return header;
	if (!Array.isArray(input.options) || input.options.length < 2 || input.options.length > 4) {
		return { ok: false, error: `${prefix}.options must contain 2-4 options` };
	}

	const labels = new Set<string>();
	const options: AskUserQuestion["options"] = [];
	let codePoints = codePointLength(question.value) + codePointLength(header.value);
	for (let optionIndex = 0; optionIndex < input.options.length; optionIndex++) {
		const option = input.options[optionIndex];
		if (!option || typeof option !== "object") {
			return { ok: false, error: `${prefix}.options[${optionIndex}] must be an object` };
		}
		const label = normalizeSingleLine(option.label, `${prefix}.options[${optionIndex}].label`, 80);
		if (!label.ok) return label;
		const description = normalizeSingleLine(
			option.description,
			`${prefix}.options[${optionIndex}].description`,
			500,
		);
		if (!description.ok) return description;
		const canonicalLabel = canonicalize(label.value);
		if (RESERVED_OPTION_LABELS.has(canonicalLabel)) {
			return {
				ok: false,
				error: `${prefix}.options[${optionIndex}].label is reserved; the UI adds Other automatically`,
			};
		}
		if (labels.has(canonicalLabel)) {
			return { ok: false, error: `${prefix} contains duplicate option labels` };
		}
		labels.add(canonicalLabel);
		options.push({ label: label.value, description: description.value });
		codePoints += codePointLength(label.value) + codePointLength(description.value);
	}

	return {
		ok: true,
		question: {
			id: `q${questionIndex + 1}`,
			question: question.value,
			header: header.value,
			options,
			multiSelect: input.multiSelect === true,
		},
		codePoints,
	};
}

export function normalizeAskUserQuestionParams(input: AskUserQuestionParamsInput): NormalizeResult {
	if (!input || typeof input !== "object" || !Array.isArray(input.questions)) {
		return { ok: false, error: "questions must be an array" };
	}
	if (input.questions.length < 1 || input.questions.length > 4) {
		return { ok: false, error: "questions must contain 1-4 questions" };
	}

	const canonicalQuestions = new Set<string>();
	const questions: AskUserQuestion[] = [];
	let totalCodePoints = 0;
	for (let index = 0; index < input.questions.length; index++) {
		const normalized = normalizeQuestion(input.questions[index]!, index);
		if (!normalized.ok) return normalized;
		const canonicalQuestion = canonicalize(normalized.question.question);
		if (canonicalQuestions.has(canonicalQuestion)) {
			return { ok: false, error: "question texts must be unique" };
		}
		canonicalQuestions.add(canonicalQuestion);
		questions.push(normalized.question);
		totalCodePoints += normalized.codePoints;
		if (totalCodePoints > MAX_TOTAL_CODE_POINTS) {
			return { ok: false, error: "questionnaire content is too large" };
		}
	}
	return { ok: true, questions };
}
