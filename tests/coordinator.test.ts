import assert from "node:assert/strict";
import test from "node:test";
import { AskUserQuestionCoordinator } from "../extensions/ask-user-question/coordinator.ts";

test("serializes active interactions and releases the slot", () => {
	const coordinator = new AskUserQuestionCoordinator();
	const first = coordinator.begin("first");
	assert.ok(first);
	assert.equal(coordinator.begin("second"), undefined);
	first.release();
	assert.ok(coordinator.begin("second"));
});

test("delivers cancellation that occurs before the UI attaches", () => {
	const coordinator = new AskUserQuestionCoordinator();
	const lease = coordinator.begin("first")!;
	coordinator.cancelActive("shutdown");
	let reason = "";
	lease.attach((result) => {
		reason = result.reason ?? "";
	});
	assert.equal(reason, "shutdown");
	lease.release();
});

test("finish and release are idempotent", () => {
	const coordinator = new AskUserQuestionCoordinator();
	const lease = coordinator.begin("first")!;
	let calls = 0;
	lease.attach(() => calls++);
	lease.finish({ outcome: "cancelled", answers: [] });
	lease.finish({ outcome: "cancelled", answers: [] });
	lease.release();
	lease.release();
	assert.equal(calls, 1);
	assert.equal(coordinator.activeId, undefined);
});
