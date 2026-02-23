import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
	createQueueEditorState,
	handleQueueEditorInput,
	type QueueEditorState,
} from "../screens/queue-editor";
import type { BufferedMessage } from "../types";

function makeItems(): BufferedMessage[] {
	return [
		{ text: "first message", mode: "steer", id: "1" },
		{ text: "second message", mode: "followUp", id: "2" },
		{ text: "third message", mode: "steer", id: "3" },
	];
}

const KEYS = {
	tab: "\t",
	up: "\u001b[A",
	down: "\u001b[B",
	enter: "\r",
	escape: "\u001b",
	delete: "\u001b[3~",
	backspace: "\u007f",
};

describe("handleQueueEditorInput", () => {
	describe("empty state", () => {
		it("enter on empty items returns save with empty array", () => {
			const state = createQueueEditorState([]);
			const action = handleQueueEditorInput(state, KEYS.enter);
			assert.deepEqual(action, { type: "save", items: [] });
		});

		it("escape on empty items returns save with empty array", () => {
			const state = createQueueEditorState([]);
			const action = handleQueueEditorInput(state, KEYS.escape);
			assert.deepEqual(action, { type: "save", items: [] });
		});

		it("unhandled keys on empty items return undefined", () => {
			const state = createQueueEditorState([]);
			const action = handleQueueEditorInput(state, "x");
			assert.equal(action, undefined);
		});
	});

	describe("navigation", () => {
		it("down arrow moves selected down", () => {
			const state = createQueueEditorState(makeItems());
			handleQueueEditorInput(state, KEYS.down);
			assert.equal(state.selected, 1);
		});

		it("up arrow moves selected up", () => {
			const state = createQueueEditorState(makeItems());
			state.selected = 2;
			handleQueueEditorInput(state, KEYS.up);
			assert.equal(state.selected, 1);
		});

		it("up arrow does not go below 0", () => {
			const state = createQueueEditorState(makeItems());
			handleQueueEditorInput(state, KEYS.up);
			assert.equal(state.selected, 0);
		});

		it("down arrow does not exceed item count", () => {
			const state = createQueueEditorState(makeItems());
			state.selected = 2;
			handleQueueEditorInput(state, KEYS.down);
			assert.equal(state.selected, 2);
		});
	});

	describe("reorder with j/k", () => {
		it("k moves item up", () => {
			const state = createQueueEditorState(makeItems());
			state.selected = 1;
			handleQueueEditorInput(state, "k");
			assert.equal(state.selected, 0);
			assert.equal(state.items[0].id, "2");
			assert.equal(state.items[1].id, "1");
		});

		it("j moves item down", () => {
			const state = createQueueEditorState(makeItems());
			state.selected = 0;
			handleQueueEditorInput(state, "j");
			assert.equal(state.selected, 1);
			assert.equal(state.items[0].id, "2");
			assert.equal(state.items[1].id, "1");
		});

		it("k at top does not move", () => {
			const state = createQueueEditorState(makeItems());
			state.selected = 0;
			handleQueueEditorInput(state, "k");
			assert.equal(state.selected, 0);
			assert.equal(state.items[0].id, "1");
		});

		it("j at bottom does not move", () => {
			const state = createQueueEditorState(makeItems());
			state.selected = 2;
			handleQueueEditorInput(state, "j");
			assert.equal(state.selected, 2);
			assert.equal(state.items[2].id, "3");
		});
	});

	describe("toggle mode", () => {
		it("tab toggles steer to followUp", () => {
			const state = createQueueEditorState(makeItems());
			assert.equal(state.items[0].mode, "steer");
			handleQueueEditorInput(state, KEYS.tab);
			assert.equal(state.items[0].mode, "followUp");
		});

		it("tab toggles followUp to steer", () => {
			const state = createQueueEditorState(makeItems());
			state.selected = 1;
			assert.equal(state.items[1].mode, "followUp");
			handleQueueEditorInput(state, KEYS.tab);
			assert.equal(state.items[1].mode, "steer");
		});
	});

	describe("delete", () => {
		it("d deletes the selected item", () => {
			const state = createQueueEditorState(makeItems());
			state.selected = 1;
			handleQueueEditorInput(state, "d");
			assert.equal(state.items.length, 2);
			assert.equal(state.items[0].id, "1");
			assert.equal(state.items[1].id, "3");
		});

		it("delete key removes selected item", () => {
			const state = createQueueEditorState(makeItems());
			handleQueueEditorInput(state, KEYS.delete);
			assert.equal(state.items.length, 2);
			assert.equal(state.items[0].id, "2");
		});

		it("deleting last item adjusts selected", () => {
			const state = createQueueEditorState(makeItems());
			state.selected = 2;
			handleQueueEditorInput(state, "d");
			assert.equal(state.items.length, 2);
			assert.equal(state.selected, 1);
		});

		it("deleting only item sets selected to 0", () => {
			const state = createQueueEditorState([
				{ text: "only", mode: "steer", id: "1" },
			]);
			handleQueueEditorInput(state, "d");
			assert.equal(state.items.length, 0);
			assert.equal(state.selected, 0);
		});
	});

	describe("edit mode", () => {
		it("e enters edit mode", () => {
			const state = createQueueEditorState(makeItems());
			handleQueueEditorInput(state, "e");
			assert.equal(state.mode, "edit");
		});

		it("in edit mode, delegates to editInput", () => {
			const state = createQueueEditorState(makeItems());
			handleQueueEditorInput(state, "e");
			assert.equal(state.mode, "edit");

			// Typing in edit mode should not return an action
			const action = handleQueueEditorInput(state, "x");
			assert.equal(action, undefined);
		});

		it("editInput.onEscape returns to list mode", () => {
			const state = createQueueEditorState(makeItems());
			handleQueueEditorInput(state, "e");
			assert.equal(state.mode, "edit");

			// Simulate escape via the Input component's onEscape callback
			state.editInput.onEscape?.();
			assert.equal(state.mode, "list");
		});

		it("editInput.onSubmit updates text and returns to list mode", () => {
			const state = createQueueEditorState(makeItems());
			handleQueueEditorInput(state, "e");
			assert.equal(state.mode, "edit");

			// Simulate submit via the Input component's onSubmit callback
			state.editInput.onSubmit?.("updated text");
			assert.equal(state.mode, "list");
			assert.equal(state.items[0].text, "updated text");
		});

		it("editInput.onSubmit with empty text preserves original", () => {
			const state = createQueueEditorState(makeItems());
			const originalText = state.items[0].text;
			handleQueueEditorInput(state, "e");

			state.editInput.onSubmit?.("   ");
			assert.equal(state.mode, "list");
			assert.equal(state.items[0].text, originalText);
		});
	});

	describe("save and cancel", () => {
		it("enter returns save action with items", () => {
			const state = createQueueEditorState(makeItems());
			const action = handleQueueEditorInput(state, KEYS.enter);
			assert.equal(action?.type, "save");
			if (action?.type === "save") {
				assert.equal(action.items.length, 3);
			}
		});

		it("escape returns cancel action", () => {
			const state = createQueueEditorState(makeItems());
			const action = handleQueueEditorInput(state, KEYS.escape);
			assert.deepEqual(action, { type: "cancel" });
		});
	});
});
