import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { handleModePickerInput, type ModePickerState } from "../screens/mode-picker";

function makeState(selected: "steer" | "followUp" = "steer"): ModePickerState {
	return { selected, messageText: "test message" };
}

// Key codes matching pi-tui's matchesKey expectations
const KEYS = {
	tab: "\t",
	up: "\u001b[A",
	down: "\u001b[B",
	left: "\u001b[D",
	right: "\u001b[C",
	enter: "\r",
	escape: "\u001b",
};

describe("handleModePickerInput", () => {
	describe("toggle selection", () => {
		it("tab toggles steer → followUp", () => {
			const state = makeState("steer");
			const action = handleModePickerInput(state, KEYS.tab);
			assert.equal(action, undefined);
			assert.equal(state.selected, "followUp");
		});

		it("tab toggles followUp → steer", () => {
			const state = makeState("followUp");
			const action = handleModePickerInput(state, KEYS.tab);
			assert.equal(action, undefined);
			assert.equal(state.selected, "steer");
		});

		it("up toggles selection", () => {
			const state = makeState("steer");
			handleModePickerInput(state, KEYS.up);
			assert.equal(state.selected, "followUp");
		});

		it("down toggles selection", () => {
			const state = makeState("steer");
			handleModePickerInput(state, KEYS.down);
			assert.equal(state.selected, "followUp");
		});
	});

	describe("directional selection", () => {
		it("left selects steer", () => {
			const state = makeState("followUp");
			handleModePickerInput(state, KEYS.left);
			assert.equal(state.selected, "steer");
		});

		it("right selects followUp", () => {
			const state = makeState("steer");
			handleModePickerInput(state, KEYS.right);
			assert.equal(state.selected, "followUp");
		});
	});

	describe("confirm and cancel", () => {
		it("enter returns select action with current mode", () => {
			const state = makeState("followUp");
			const action = handleModePickerInput(state, KEYS.enter);
			assert.deepEqual(action, { type: "select", mode: "followUp" });
		});

		it("enter returns select action for steer", () => {
			const state = makeState("steer");
			const action = handleModePickerInput(state, KEYS.enter);
			assert.deepEqual(action, { type: "select", mode: "steer" });
		});

		it("escape returns cancel action", () => {
			const state = makeState("steer");
			const action = handleModePickerInput(state, KEYS.escape);
			assert.deepEqual(action, { type: "cancel" });
		});
	});

	describe("unhandled keys", () => {
		it("returns undefined for unrecognized input", () => {
			const state = makeState("steer");
			const action = handleModePickerInput(state, "x");
			assert.equal(action, undefined);
			assert.equal(state.selected, "steer");
		});
	});
});
