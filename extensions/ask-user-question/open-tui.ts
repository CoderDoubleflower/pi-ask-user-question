import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** Public provider event already supported by pi-open-tui. */
export const OPEN_TUI_SPINNER_OVERRIDE_EVENT = "open-tui:spinner:override:v1";
export const OPEN_TUI_INTERACTION_SOURCE = "pi-ask-user-question";
export const OPEN_TUI_WAITING_MESSAGE = "Waiting for your answer";

export interface OpenTuiSpinnerOverrideEventV1 {
	version: 1;
	source: string;
	message: string | null;
	scope: "agent";
}

/**
 * Announces the interaction through pi-open-tui's public Event Bus API.
 * It is intentionally best-effort: the question tool also works when
 * pi-open-tui is absent or its spinner is disabled.
 */
export function beginOpenTuiInteraction(
	events: ExtensionAPI["events"],
	_id: string,
): () => void {
	let released = false;
	const emit = (message: string | null) => {
		try {
			events.emit(OPEN_TUI_SPINNER_OVERRIDE_EVENT, {
				version: 1,
				source: OPEN_TUI_INTERACTION_SOURCE,
				message,
				scope: "agent",
			} satisfies OpenTuiSpinnerOverrideEventV1);
		} catch {
			// The integration is optional; a listener must never break the tool.
		}
	};
	emit(OPEN_TUI_WAITING_MESSAGE);
	return () => {
		if (released) return;
		released = true;
		emit(null);
	};
}
