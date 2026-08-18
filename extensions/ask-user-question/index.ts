import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import type { Static } from "typebox";
import { AskUserQuestionComponent } from "./component.ts";
import { AskUserQuestionCoordinator } from "./coordinator.ts";
import { normalizeAskUserQuestionParams } from "./model.ts";
import { beginOpenTuiInteraction } from "./open-tui.ts";
import {
	buildAskUserQuestionDetails,
	formatCompactResult,
	formatModelFacingResult,
} from "./result.ts";
import { AskUserQuestionParamsSchema } from "./schema.ts";
import type {
	AskUserQuestion,
	AskUserQuestionDetails,
	AskUserQuestionInteractionResult,
	AskUserQuestionParamsInput,
} from "./types.ts";

export const ASK_USER_QUESTION_TOOL_NAME = "ask_user_question";

function unavailableDetails(
	questions: readonly AskUserQuestion[],
	reason: string,
): AskUserQuestionDetails {
	return buildAskUserQuestionDetails(questions, {
		outcome: "unavailable",
		answers: [],
		reason,
	});
}

function toToolResult(details: AskUserQuestionDetails) {
	return {
		content: [{ type: "text" as const, text: formatModelFacingResult(details) }],
		details,
	};
}

export function registerAskUserQuestion(
	pi: ExtensionAPI,
	coordinator = new AskUserQuestionCoordinator(),
): AskUserQuestionCoordinator {
	pi.on("session_shutdown", () => {
		coordinator.cancelActive("The session ended before the questions were answered.");
	});

	pi.registerTool({
		name: ASK_USER_QUESTION_TOOL_NAME,
		label: "Ask User Question",
		description:
			"Ask the user one or more structured questions when their preferences, requirements, or decisions are needed before continuing.",
		promptSnippet: "Ask the user 1-4 structured single-choice or multi-choice questions.",
		promptGuidelines: [
			"Use ask_user_question only when the user's answer materially affects the implementation.",
			"Combine related questions into one invocation and ask at most four questions.",
			"Do not include an Other option; the UI adds it automatically.",
			"Use multiSelect only when multiple choices can validly be selected together.",
			"Put the recommended choice first and append (Recommended) to its label.",
			"Invoke ask_user_question alone in a tool-call turn. Do not batch it with edits, shell commands, or actions that depend on the answer.",
			"Do not ask for routine permission to continue when a safe, reasonable default is available.",
		],
		parameters: AskUserQuestionParamsSchema,
		executionMode: "sequential",

		async execute(_toolCallId, rawParams, signal, _onUpdate, ctx) {
			const params = rawParams as Static<typeof AskUserQuestionParamsSchema> & AskUserQuestionParamsInput;
			const normalized = normalizeAskUserQuestionParams(params);
			if (!normalized.ok) {
				return toToolResult(unavailableDetails([], `Invalid questionnaire: ${normalized.error}`));
			}
			const questions = normalized.questions;
			if (ctx.mode !== "tui" || !ctx.hasUI) {
				return toToolResult(
					unavailableDetails(
						questions,
						ctx.mode !== "tui"
							? `Current extension mode is ${ctx.mode}, not tui.`
							: "The TUI context does not expose dialog-capable UI.",
					),
				);
			}
			if (signal?.aborted) {
				return toToolResult(
					buildAskUserQuestionDetails(questions, {
						outcome: "cancelled",
						answers: [],
						reason: "The agent operation was aborted before the questionnaire opened.",
					}),
				);
			}

			const lease = coordinator.begin(_toolCallId);
			if (!lease) {
				return toToolResult(
					unavailableDetails(
						questions,
						`Another interactive questionnaire is already active (${coordinator.activeId ?? "unknown"}).`,
					),
				);
			}

			const endOpenTuiInteraction = beginOpenTuiInteraction(pi.events, _toolCallId);
			const onAbort = () => {
				lease.finish({
					outcome: "cancelled",
					answers: [],
					reason: "The agent operation was aborted while waiting for answers.",
				});
			};
			signal?.addEventListener("abort", onAbort, { once: true });

			try {
				const interaction = await ctx.ui.custom<AskUserQuestionInteractionResult>(
					(tui, theme, keybindings, done) => {
						lease.attach(done);
						return new AskUserQuestionComponent({
							tui,
							theme,
							keybindings,
							questions,
							onDone: (result) => lease.finish(result),
						});
					},
				);
				return toToolResult(buildAskUserQuestionDetails(questions, interaction));
			} catch (error) {
				if (signal?.aborted) {
					return toToolResult(
						buildAskUserQuestionDetails(questions, {
							outcome: "cancelled",
							answers: [],
							reason: "The agent operation was aborted while waiting for answers.",
						}),
					);
				}
				const reason = `Unable to show the questionnaire UI: ${error instanceof Error ? error.message : String(error)}`;
				return toToolResult(unavailableDetails(questions, reason));
			} finally {
				signal?.removeEventListener("abort", onAbort);
				endOpenTuiInteraction();
				lease.release();
			}
		},

		renderCall(args, theme) {
			const rawQuestions = Array.isArray(args.questions) ? args.questions : [];
			const headers = rawQuestions
				.map((question) => typeof question?.header === "string" ? question.header : "")
				.filter(Boolean);
			let text = theme.fg("toolTitle", theme.bold("AskUserQuestion"));
			text += theme.fg("muted", ` · ${rawQuestions.length} question${rawQuestions.length === 1 ? "" : "s"}`);
			if (headers.length > 0) text += theme.fg("dim", ` (${headers.join(", ")})`);
			return new Text(text, 0, 0);
		},

		renderResult(result, _options, theme) {
			const details = result.details as AskUserQuestionDetails | undefined;
			if (!details) {
				const first = result.content[0];
				return new Text(first?.type === "text" ? first.text : "", 0, 0);
			}
			const lines = formatCompactResult(details);
			if (details.outcome === "answered") {
				return new Text(
					[
						theme.fg("success", "● User answered:"),
						...lines.map((line) => theme.fg("muted", `  · ${line}`)),
					].join("\n"),
					0,
					0,
				);
			}
			const color = details.outcome === "cancelled" ? "warning" : details.outcome === "unavailable" ? "warning" : "accent";
			return new Text(theme.fg(color, `● ${lines[0] ?? details.outcome}`), 0, 0);
		},
	});

	return coordinator;
}

export default function askUserQuestionExtension(pi: ExtensionAPI): void {
	registerAskUserQuestion(pi);
}
