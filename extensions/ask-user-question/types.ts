export interface AskUserQuestionOptionInput {
	label: string;
	description: string;
}

export interface AskUserQuestionInput {
	question: string;
	header: string;
	options: AskUserQuestionOptionInput[];
	multiSelect?: boolean;
}

export interface AskUserQuestionParamsInput {
	questions: AskUserQuestionInput[];
}

export interface AskUserQuestionOption {
	label: string;
	description: string;
}

export interface AskUserQuestion {
	id: string;
	question: string;
	header: string;
	options: AskUserQuestionOption[];
	multiSelect: boolean;
}

export interface AskUserQuestionAnswer {
	questionIndex: number;
	question: string;
	header: string;
	selectedLabels: string[];
	customText?: string;
}

export type AskUserQuestionOutcome =
	| "answered"
	| "clarify"
	| "cancelled"
	| "unavailable";

export interface AskUserQuestionInteractionResult {
	outcome: Exclude<AskUserQuestionOutcome, "unavailable">;
	answers: AskUserQuestionAnswer[];
	reason?: string;
}

export interface AskUserQuestionDetails {
	outcome: AskUserQuestionOutcome;
	questions: AskUserQuestion[];
	answers: AskUserQuestionAnswer[];
	unansweredQuestionIndexes: number[];
	reason?: string;
}

export type AskUserQuestionScreen = "question" | "other-input" | "review";

export interface AskUserQuestionRuntimeState {
	focusIndex: number;
	selectedLabels: string[];
	customText: string;
}

export type AskUserQuestionRow =
	| { kind: "option"; optionIndex: number }
	| { kind: "other" }
	| { kind: "primary" }
	| { kind: "chat" };

export type AskUserQuestionMachineEffect =
	| { type: "none" }
	| { type: "open-other"; initialValue: string }
	| { type: "complete"; result: AskUserQuestionInteractionResult };
