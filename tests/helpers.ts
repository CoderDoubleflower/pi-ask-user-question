import type { AskUserQuestion } from "../extensions/ask-user-question/types.ts";

export function sampleQuestions(): AskUserQuestion[] {
	return [
		{
			id: "q1",
			question: "Which database should be used?",
			header: "Database",
			multiSelect: false,
			options: [
				{ label: "SQLite", description: "Simple embedded storage." },
				{ label: "PostgreSQL", description: "A production relational database." },
			],
		},
		{
			id: "q2",
			question: "Which features should be enabled?",
			header: "Features",
			multiSelect: true,
			options: [
				{ label: "Logging", description: "Structured application logs." },
				{ label: "Metrics", description: "Runtime metrics collection." },
			],
		},
	];
}
