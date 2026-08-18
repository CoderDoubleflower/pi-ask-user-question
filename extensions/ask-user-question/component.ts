import type {
	KeybindingsManager,
	Theme,
} from "@earendil-works/pi-coding-agent";
import {
	Editor,
	type EditorTheme,
	Key,
	matchesKey,
	truncateToWidth,
	visibleWidth,
	wrapTextWithAnsi,
	type Component,
	type TUI,
} from "@earendil-works/pi-tui";
import { AskUserQuestionMachine } from "./state.ts";
import type {
	AskUserQuestion,
	AskUserQuestionAnswer,
	AskUserQuestionInteractionResult,
	AskUserQuestionMachineEffect,
	AskUserQuestionRow,
} from "./types.ts";

export interface AskUserQuestionComponentOptions {
	tui: TUI;
	theme: Theme;
	keybindings: KeybindingsManager;
	questions: readonly AskUserQuestion[];
	onDone(result: AskUserQuestionInteractionResult): void;
}

const OTHER_LABEL = "Other";
const WIDE_NAV_MIN_WIDTH = 60;

type AskUserQuestionOptionRow =
	| Extract<AskUserQuestionRow, { kind: "option" }>
	| Extract<AskUserQuestionRow, { kind: "other" }>;

function answerValues(answer: AskUserQuestionAnswer): string[] {
	const values = [...answer.selectedLabels];
	if (answer.customText) values.push(answer.customText);
	return values;
}

export class AskUserQuestionComponent implements Component {
	private readonly tui: TUI;
	private readonly theme: Theme;
	private readonly keybindings: KeybindingsManager;
	private readonly onDone: (result: AskUserQuestionInteractionResult) => void;
	private readonly machine: AskUserQuestionMachine;
	private readonly editor: Editor;
	private cachedWidth: number | undefined;
	private cachedLines: string[] | undefined;
	private done = false;

	constructor(options: AskUserQuestionComponentOptions) {
		this.tui = options.tui;
		this.theme = options.theme;
		this.keybindings = options.keybindings;
		this.onDone = options.onDone;
		this.machine = new AskUserQuestionMachine(options.questions);

		const editorTheme: EditorTheme = {
			borderColor: (text) => this.theme.fg("accent", text),
			selectList: {
				selectedPrefix: (text) => this.theme.fg("accent", text),
				selectedText: (text) => this.theme.fg("accent", text),
				description: (text) => this.theme.fg("muted", text),
				scrollInfo: (text) => this.theme.fg("dim", text),
				noMatch: (text) => this.theme.fg("warning", text),
			},
		};
		this.editor = new Editor(this.tui, editorTheme);
		this.editor.onSubmit = (value) => {
			this.applyEffect(this.machine.submitOther(value));
		};
	}

	handleInput(data: string): void {
		if (this.done) return;

		if (this.machine.screen === "other-input") {
			if (
				this.keybindings.matches(data, "tui.select.cancel")
				|| matchesKey(data, Key.escape)
			) {
				this.machine.cancelOther();
				this.refresh();
				return;
			}
			this.editor.handleInput(data);
			this.refresh();
			return;
		}

		if (matchesKey(data, Key.shift("tab")) || matchesKey(data, Key.left)) {
			this.applyEffect(this.machine.previousTab());
			return;
		}
		if (
			this.keybindings.matches(data, "tui.input.tab")
			|| matchesKey(data, Key.tab)
			|| matchesKey(data, Key.right)
		) {
			this.applyEffect(this.machine.nextTab());
			return;
		}
		if (this.keybindings.matches(data, "tui.select.up") || matchesKey(data, Key.up)) {
			this.applyEffect(this.machine.moveVertical(-1));
			return;
		}
		if (this.keybindings.matches(data, "tui.select.down") || matchesKey(data, Key.down)) {
			this.applyEffect(this.machine.moveVertical(1));
			return;
		}
		if (
			this.keybindings.matches(data, "tui.select.confirm")
			|| matchesKey(data, Key.enter)
			|| matchesKey(data, Key.space)
			|| data === " "
		) {
			this.applyEffect(this.machine.confirm());
			return;
		}
		if (
			this.keybindings.matches(data, "tui.select.cancel")
			|| matchesKey(data, Key.escape)
		) {
			this.applyEffect(this.machine.cancel());
		}
	}

	render(width: number): string[] {
		if (this.done || width <= 0) return [];
		if (this.cachedLines && this.cachedWidth === width) return this.cachedLines;
		this.cachedWidth = width;

		const renderWidth = Math.max(1, width);
		const lines: string[] = [];
		this.pushDivider(lines, renderWidth);
		this.renderNavigation(lines, renderWidth);

		if (this.machine.screen === "review") {
			this.renderReview(lines, renderWidth);
		} else {
			this.renderQuestion(lines, renderWidth);
		}

		if (this.machine.warning) {
			lines.push("");
			this.pushWrapped(lines, renderWidth, " ", this.theme.fg("warning", this.machine.warning));
		}
		lines.push("");
		this.renderHint(lines, renderWidth);
		this.pushDivider(lines, renderWidth);

		const ellipsis = this.theme.fg("dim", "…");
		this.cachedLines = lines.map((line) => truncateToWidth(line, renderWidth, ellipsis));
		return this.cachedLines;
	}

	invalidate(): void {
		this.cachedWidth = undefined;
		this.cachedLines = undefined;
		this.editor.invalidate?.();
	}

	dispose(): void {
		const disposable = this.editor as Editor & { dispose?: () => void };
		disposable.dispose?.();
	}

	private renderNavigation(lines: string[], width: number): void {
		if (!this.machine.showQuestionNavigation && this.machine.screen !== "review") return;
		if (width < WIDE_NAV_MIN_WIDTH) {
			const isReview = this.machine.screen === "review";
			const current = isReview
				? this.machine.questions.length + 1
				: this.machine.currentQuestionIndex + 1;
			const total = this.machine.questions.length + 1;
			const label = isReview ? "Review" : this.machine.currentQuestion.header;
			const left = current > 1 ? "←" : " ";
			const right = current < total ? "→" : " ";
			this.pushWrapped(
				lines,
				width,
				" ",
				this.theme.fg("dim", `${left} ${current}/${total} · ${label} ${right}`),
			);
			lines.push("");
			return;
		}

		const tabCount = this.machine.questions.length + 1;
		const available = Math.max(16, width - 4 - Math.max(0, tabCount - 1));
		const perTab = Math.max(7, Math.floor(available / tabCount));
		const tabs: string[] = [];
		for (let index = 0; index < this.machine.questions.length; index++) {
			const question = this.machine.questions[index]!;
			const answered = this.machine.isQuestionAnswered(index);
			const active = this.machine.screen === "question" && index === this.machine.currentQuestionIndex;
			const icon = answered ? "✓" : "○";
			const maxLabelWidth = Math.max(1, perTab - 4);
			const label = truncateToWidth(question.header, maxLabelWidth, "…");
			const text = ` ${icon} ${label} `;
			tabs.push(
				active
					? this.theme.bg("selectedBg", this.theme.fg("text", text))
					: this.theme.fg(answered ? "success" : "muted", text),
			);
		}
		const reviewActive = this.machine.screen === "review";
		const reviewText = " ✓ Review ";
		tabs.push(
			reviewActive
				? this.theme.bg("selectedBg", this.theme.fg("text", reviewText))
				: this.theme.fg(this.machine.allAnswered ? "success" : "dim", reviewText),
		);
		this.pushWrapped(lines, width, " ", `← ${tabs.join(" ")} →`);
		lines.push("");
	}

	private renderQuestion(lines: string[], width: number): void {
		const question = this.machine.currentQuestion;
		this.pushWrapped(
			lines,
			width,
			" ",
			this.theme.bold(this.theme.fg("text", question.question)),
		);
		lines.push("");

		for (let index = 0; index < question.options.length; index++) {
			this.renderOption(lines, width, { kind: "option", optionIndex: index });
		}
		this.renderOption(lines, width, { kind: "other" });

		if (this.machine.screen === "other-input") {
			lines.push("");
			this.pushWrapped(lines, width, " ", this.theme.fg("muted", "Your answer:"));
			for (const line of this.editor.render(Math.max(1, width - 2))) {
				lines.push(` ${line}`);
			}
			return;
		}

		if (question.multiSelect) {
			lines.push("");
			this.renderActionRow(
				lines,
				width,
				{ kind: "primary" },
				this.machine.currentQuestionIndex < this.machine.questions.length - 1
					? "Next"
					: "Review answers",
			);
		}

		lines.push("");
		this.pushDivider(lines, width);
		this.renderActionRow(lines, width, { kind: "chat" }, "Chat about this");
	}

	private renderOption(lines: string[], width: number, row: AskUserQuestionOptionRow): void {
		const question = this.machine.currentQuestion;
		const state = this.machine.currentQuestionState;
		const focused = this.sameRow(this.machine.currentRow, row);
		const isOther = row.kind === "other";
		const label = isOther ? OTHER_LABEL : question.options[row.optionIndex]!.label;
		const description = isOther
			? "Provide a custom answer."
			: question.options[row.optionIndex]!.description;
		const selected = isOther
			? state.customText.trim().length > 0 && (question.multiSelect || state.selectedLabels.length === 0)
			: state.selectedLabels.includes(label);
		const pointer = focused ? this.theme.fg("accent", "❯ ") : "  ";
		const mark = question.multiSelect
			? `[${selected ? "✓" : " "}]`
			: selected
				? "●"
				: "○";
		const number = isOther ? question.options.length + 1 : row.optionIndex + 1;
		const color = selected ? "success" : focused ? "accent" : "text";
		const text = `${number}. ${mark} ${label}`;
		this.pushWrapped(lines, width, pointer, this.theme.fg(color, focused ? this.theme.bold(text) : text));
		this.pushWrapped(lines, width, "     ", this.theme.fg("muted", description));
	}

	private renderActionRow(
		lines: string[],
		width: number,
		row: AskUserQuestionRow,
		label: string,
	): void {
		const focused = this.sameRow(this.machine.currentRow, row);
		const pointer = focused ? this.theme.fg("accent", "❯ ") : "  ";
		this.pushWrapped(
			lines,
			width,
			pointer,
			focused
				? this.theme.bold(this.theme.fg("accent", label))
				: this.theme.fg("text", label),
		);
	}

	private renderReview(lines: string[], width: number): void {
		this.pushWrapped(
			lines,
			width,
			" ",
			this.theme.bold(this.theme.fg("text", "Review your answers")),
		);
		lines.push("");
		const answers = new Map(this.machine.getAnswers().map((answer) => [answer.questionIndex, answer]));
		for (let index = 0; index < this.machine.questions.length; index++) {
			const question = this.machine.questions[index]!;
			const answer = answers.get(index);
			const icon = answer ? this.theme.fg("success", "✓") : this.theme.fg("warning", "○");
			this.pushWrapped(lines, width, " ", `${icon} ${this.theme.fg("text", question.header)}`);
			if (answer) {
				this.pushWrapped(
					lines,
					width,
					"   → ",
					this.theme.fg("success", answerValues(answer).join(", ")),
				);
			} else {
				this.pushWrapped(lines, width, "   → ", this.theme.fg("warning", "Not answered"));
			}
		}
		lines.push("");
		for (let index = 0; index < this.machine.reviewActionLabels.length; index++) {
			const focused = index === this.machine.reviewFocusIndex;
			const pointer = focused ? this.theme.fg("accent", "❯ ") : "  ";
			const label = this.machine.reviewActionLabels[index]!;
			this.pushWrapped(
				lines,
				width,
				pointer,
				focused
					? this.theme.bold(this.theme.fg("accent", label))
					: this.theme.fg("text", label),
			);
		}
	}

	private renderHint(lines: string[], width: number): void {
		let hint: string;
		if (this.machine.screen === "other-input") {
			hint = "Enter to save · Esc to return to choices";
		} else if (this.machine.screen === "review") {
			hint = "↑/↓ to move · Enter to confirm · Shift+Tab/← to return · Esc to cancel";
		} else if (this.machine.questions.length > 1) {
			hint = "↑/↓ to move · Enter/Space to select · Tab/←/→ to switch · Esc to cancel";
		} else {
			hint = "↑/↓ to move · Enter/Space to select · Esc to cancel";
		}
		this.pushWrapped(lines, width, " ", this.theme.fg("dim", hint));
	}

	private applyEffect(effect: AskUserQuestionMachineEffect): void {
		if (effect.type === "open-other") {
			this.editor.setText(effect.initialValue);
			this.refresh();
			return;
		}
		if (effect.type === "complete") {
			this.finish(effect.result);
			return;
		}
		this.refresh();
	}

	private finish(result: AskUserQuestionInteractionResult): void {
		if (this.done) return;
		this.done = true;
		this.onDone(result);
	}

	private refresh(): void {
		this.invalidate();
		this.tui.requestRender();
	}

	private pushDivider(lines: string[], width: number): void {
		lines.push(this.theme.fg("dim", "─".repeat(Math.max(1, width))));
	}

	private pushWrapped(lines: string[], width: number, prefix: string, content: string): void {
		const prefixWidth = visibleWidth(prefix);
		if (prefixWidth >= width) {
			lines.push(...wrapTextWithAnsi(`${prefix}${content}`, width));
			return;
		}
		const wrapped = wrapTextWithAnsi(content, Math.max(1, width - prefixWidth));
		const continuation = " ".repeat(prefixWidth);
		if (wrapped.length === 0) {
			lines.push(prefix);
			return;
		}
		for (let index = 0; index < wrapped.length; index++) {
			lines.push(`${index === 0 ? prefix : continuation}${wrapped[index]}`);
		}
	}

	private sameRow(left: AskUserQuestionRow, right: AskUserQuestionRow): boolean {
		return left.kind === right.kind
			&& (left.kind !== "option"
				|| (right.kind === "option" && left.optionIndex === right.optionIndex));
	}
}
