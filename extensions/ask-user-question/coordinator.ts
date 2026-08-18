import type { AskUserQuestionInteractionResult } from "./types.ts";

export interface InteractionLease {
	readonly id: string;
	attach(finish: (result: AskUserQuestionInteractionResult) => void): void;
	finish(result: AskUserQuestionInteractionResult): void;
	release(): void;
}

class InteractionLeaseImpl implements InteractionLease {
	readonly id: string;
	private readonly onRelease: () => void;
	private finishCallback: ((result: AskUserQuestionInteractionResult) => void) | undefined;
	private pendingResult: AskUserQuestionInteractionResult | undefined;
	private finished = false;
	private released = false;

	constructor(id: string, onRelease: () => void) {
		this.id = id;
		this.onRelease = onRelease;
	}

	attach(finish: (result: AskUserQuestionInteractionResult) => void): void {
		if (this.finishCallback || this.released) return;
		this.finishCallback = finish;
		if (this.pendingResult) {
			const result = this.pendingResult;
			this.pendingResult = undefined;
			finish(result);
		}
	}

	finish(result: AskUserQuestionInteractionResult): void {
		if (this.finished || this.released) return;
		this.finished = true;
		if (this.finishCallback) this.finishCallback(result);
		else this.pendingResult = result;
	}

	release(): void {
		if (this.released) return;
		this.released = true;
		this.finishCallback = undefined;
		this.pendingResult = undefined;
		this.onRelease();
	}
}

export class AskUserQuestionCoordinator {
	private active: InteractionLeaseImpl | undefined;

	begin(id: string): InteractionLease | undefined {
		if (this.active) return undefined;
		const lease = new InteractionLeaseImpl(id, () => {
			if (this.active === lease) this.active = undefined;
		});
		this.active = lease;
		return lease;
	}

	cancelActive(reason: string): void {
		this.active?.finish({
			outcome: "cancelled",
			answers: [],
			reason,
		});
	}

	get activeId(): string | undefined {
		return this.active?.id;
	}
}
