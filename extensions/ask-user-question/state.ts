import type {
	AskUserQuestion,
	AskUserQuestionAnswer,
	AskUserQuestionInteractionResult,
	AskUserQuestionMachineEffect,
	AskUserQuestionRow,
	AskUserQuestionRuntimeState,
	AskUserQuestionScreen,
} from "./types.ts";

function none(): AskUserQuestionMachineEffect {
	return { type: "none" };
}

export class AskUserQuestionMachine {
	readonly questions: readonly AskUserQuestion[];
	readonly questionStates: AskUserQuestionRuntimeState[];
	currentQuestionIndex = 0;
	screen: AskUserQuestionScreen = "question";
	reviewFocusIndex = 0;
	warning: string | undefined;

	constructor(questions: readonly AskUserQuestion[]) {
		if (questions.length === 0) throw new Error("At least one question is required");
		this.questions = questions;
		this.questionStates = questions.map(() => ({
			focusIndex: 0,
			selectedLabels: [],
			customText: "",
		}));
	}

	get currentQuestion(): AskUserQuestion {
		return this.questions[this.currentQuestionIndex]!;
	}

	get currentQuestionState(): AskUserQuestionRuntimeState {
		return this.questionStates[this.currentQuestionIndex]!;
	}

	get showQuestionNavigation(): boolean {
		return this.questions.length > 1 || this.currentQuestion.multiSelect;
	}

	get currentRow(): AskUserQuestionRow {
		const question = this.currentQuestion;
		const focusIndex = this.currentQuestionState.focusIndex;
		if (focusIndex < question.options.length) {
			return { kind: "option", optionIndex: focusIndex };
		}
		let index = question.options.length;
		if (focusIndex === index) return { kind: "other" };
		index++;
		if (question.multiSelect) {
			if (focusIndex === index) return { kind: "primary" };
			index++;
		}
		return { kind: "chat" };
	}

	get currentQuestionRowCount(): number {
		return this.currentQuestion.options.length + 1 + (this.currentQuestion.multiSelect ? 1 : 0) + 1;
	}

	get allAnswered(): boolean {
		return this.questions.every((_, index) => this.isQuestionAnswered(index));
	}

	get unansweredQuestionIndexes(): number[] {
		const result: number[] = [];
		for (let index = 0; index < this.questions.length; index++) {
			if (!this.isQuestionAnswered(index)) result.push(index);
		}
		return result;
	}

	get reviewActionLabels(): string[] {
		const firstMissing = this.unansweredQuestionIndexes[0];
		return [
			firstMissing === undefined
				? "Submit answers"
				: `Return to ${this.questions[firstMissing]!.header}`,
			"Chat about this",
			"Cancel",
		];
	}

	moveVertical(delta: -1 | 1): AskUserQuestionMachineEffect {
		this.warning = undefined;
		if (this.screen === "other-input") return none();
		if (this.screen === "review") {
			this.reviewFocusIndex = Math.max(0, Math.min(this.reviewActionLabels.length - 1, this.reviewFocusIndex + delta));
			return none();
		}
		const state = this.currentQuestionState;
		state.focusIndex = Math.max(0, Math.min(this.currentQuestionRowCount - 1, state.focusIndex + delta));
		return none();
	}

	nextTab(): AskUserQuestionMachineEffect {
		this.warning = undefined;
		if (this.screen === "other-input") return none();
		if (this.screen === "review") return none();
		if (this.currentQuestionIndex < this.questions.length - 1) {
			this.currentQuestionIndex++;
			return none();
		}
		if (this.showQuestionNavigation) {
			this.screen = "review";
			this.reviewFocusIndex = 0;
		}
		return none();
	}

	previousTab(): AskUserQuestionMachineEffect {
		this.warning = undefined;
		if (this.screen === "other-input") return none();
		if (this.screen === "review") {
			this.screen = "question";
			this.currentQuestionIndex = this.questions.length - 1;
			return none();
		}
		if (this.currentQuestionIndex > 0) this.currentQuestionIndex--;
		return none();
	}

	confirm(): AskUserQuestionMachineEffect {
		this.warning = undefined;
		if (this.screen === "other-input") return none();
		if (this.screen === "review") return this.confirmReview();

		const row = this.currentRow;
		const question = this.currentQuestion;
		const state = this.currentQuestionState;
		switch (row.kind) {
			case "option": {
				const label = question.options[row.optionIndex]!.label;
				if (question.multiSelect) {
					const selected = new Set(state.selectedLabels);
					if (selected.has(label)) selected.delete(label);
					else selected.add(label);
					state.selectedLabels = question.options
						.map((option) => option.label)
						.filter((optionLabel) => selected.has(optionLabel));
					return none();
				}
				state.selectedLabels = [label];
				return this.advanceAfterSingleSelection();
			}
			case "other":
				this.screen = "other-input";
				return { type: "open-other", initialValue: state.customText };
			case "primary":
				if (!this.isQuestionAnswered(this.currentQuestionIndex)) {
					this.warning = "Select at least one answer before continuing.";
					return none();
				}
				if (this.currentQuestionIndex < this.questions.length - 1) {
					this.currentQuestionIndex++;
					return none();
				}
				this.screen = "review";
				this.reviewFocusIndex = 0;
				return none();
			case "chat":
				return this.complete("clarify", "The user wants to discuss the questions before answering.");
		}
	}

	submitOther(value: string): AskUserQuestionMachineEffect {
		if (this.screen !== "other-input") return none();
		const trimmed = value.trim();
		const question = this.currentQuestion;
		const state = this.currentQuestionState;
		if (trimmed.length === 0) {
			if (question.multiSelect && state.customText.length > 0) {
				state.customText = "";
				this.screen = "question";
				this.warning = undefined;
				return none();
			}
			this.warning = "Type an answer, or press Escape to return to the choices.";
			return none();
		}
		state.customText = trimmed;
		this.warning = undefined;
		this.screen = "question";
		if (question.multiSelect) return none();
		state.selectedLabels = [];
		return this.advanceAfterSingleSelection();
	}

	cancelOther(): AskUserQuestionMachineEffect {
		if (this.screen === "other-input") {
			this.screen = "question";
			this.warning = undefined;
		}
		return none();
	}

	cancel(reason = "The user declined to answer the questions."): AskUserQuestionMachineEffect {
		return this.complete("cancelled", reason);
	}

	isQuestionAnswered(questionIndex: number): boolean {
		const question = this.questions[questionIndex]!;
		const state = this.questionStates[questionIndex]!;
		if (question.multiSelect) {
			return state.selectedLabels.length > 0 || state.customText.trim().length > 0;
		}
		return state.selectedLabels.length === 1 || state.customText.trim().length > 0;
	}

	getAnswers(): AskUserQuestionAnswer[] {
		const answers: AskUserQuestionAnswer[] = [];
		for (let index = 0; index < this.questions.length; index++) {
			if (!this.isQuestionAnswered(index)) continue;
			const question = this.questions[index]!;
			const state = this.questionStates[index]!;
			const selectedLabels = [...state.selectedLabels];
			const customText = state.customText.trim();
			answers.push({
				questionIndex: index,
				question: question.question,
				header: question.header,
				selectedLabels,
				...(customText.length > 0 && (question.multiSelect || selectedLabels.length === 0)
					? { customText }
					: {}),
			});
		}
		return answers;
	}

	private advanceAfterSingleSelection(): AskUserQuestionMachineEffect {
		if (this.questions.length === 1) return this.complete("answered");
		if (this.currentQuestionIndex < this.questions.length - 1) {
			this.currentQuestionIndex++;
			return none();
		}
		this.screen = "review";
		this.reviewFocusIndex = 0;
		return none();
	}

	private confirmReview(): AskUserQuestionMachineEffect {
		switch (this.reviewFocusIndex) {
			case 0: {
				const firstMissing = this.unansweredQuestionIndexes[0];
				if (firstMissing !== undefined) {
					this.screen = "question";
					this.currentQuestionIndex = firstMissing;
					return none();
				}
				return this.complete("answered");
			}
			case 1:
				return this.complete("clarify", "The user wants to discuss the questions before answering.");
			default:
				return this.complete("cancelled", "The user declined to answer the questions.");
		}
	}

	private complete(
		outcome: AskUserQuestionInteractionResult["outcome"],
		reason?: string,
	): AskUserQuestionMachineEffect {
		return {
			type: "complete",
			result: {
				outcome,
				answers: this.getAnswers(),
				...(reason ? { reason } : {}),
			},
		};
	}
}
