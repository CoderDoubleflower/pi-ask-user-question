import { Type } from "typebox";

const AskUserQuestionOptionSchema = Type.Object(
	{
		label: Type.String({
			minLength: 1,
			maxLength: 80,
			description: "Concise display label for this choice. Do not add an Other option.",
		}),
		description: Type.String({
			minLength: 1,
			maxLength: 500,
			description: "Explain what this choice means and any relevant trade-offs.",
		}),
	},
	{ additionalProperties: false },
);

const AskUserQuestionSchema = Type.Object(
	{
		question: Type.String({
			minLength: 1,
			maxLength: 500,
			description: "The complete, specific question to show the user.",
		}),
		header: Type.String({
			minLength: 1,
			maxLength: 40,
			description: "A short label for the question navigation tab, such as Database or Scope.",
		}),
		options: Type.Array(AskUserQuestionOptionSchema, {
			minItems: 2,
			maxItems: 4,
			description: "Two to four distinct choices. The UI adds Other automatically.",
		}),
		multiSelect: Type.Optional(
			Type.Boolean({
				description: "Allow multiple selections when the choices are not mutually exclusive.",
			}),
		),
	},
	{ additionalProperties: false },
);

export const AskUserQuestionParamsSchema = Type.Object(
	{
		questions: Type.Array(AskUserQuestionSchema, {
			minItems: 1,
			maxItems: 4,
			description: "One to four related questions to ask in one interaction.",
		}),
	},
	{ additionalProperties: false },
);
