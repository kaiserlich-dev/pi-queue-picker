import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { addMessage, shiftNext, shiftNextSteer, updateWidget } from "../buffer";
import type { BufferedMessage } from "../types";

function makeMsg(text: string, mode: "steer" | "followUp" = "followUp", id?: string): BufferedMessage {
	return { text, mode, id: id ?? `test-${text}` };
}

describe("addMessage", () => {
	it("adds a message to the buffer", () => {
		const buffer: BufferedMessage[] = [];
		addMessage(buffer, makeMsg("hello"));
		assert.equal(buffer.length, 1);
		assert.equal(buffer[0].text, "hello");
	});

	it("appends to existing buffer", () => {
		const buffer = [makeMsg("first")];
		addMessage(buffer, makeMsg("second"));
		assert.equal(buffer.length, 2);
		assert.equal(buffer[1].text, "second");
	});
});

describe("shiftNext", () => {
	it("returns first message and removes it", () => {
		const buffer = [makeMsg("first"), makeMsg("second")];
		const msg = shiftNext(buffer);
		assert.equal(msg?.text, "first");
		assert.equal(buffer.length, 1);
		assert.equal(buffer[0].text, "second");
	});

	it("returns undefined for empty buffer", () => {
		const buffer: BufferedMessage[] = [];
		const msg = shiftNext(buffer);
		assert.equal(msg, undefined);
	});
});

describe("shiftNextSteer", () => {
	it("returns first steer message", () => {
		const buffer = [
			makeMsg("follow1", "followUp"),
			makeMsg("steer1", "steer"),
			makeMsg("follow2", "followUp"),
		];
		const msg = shiftNextSteer(buffer);
		assert.equal(msg?.text, "steer1");
		assert.equal(buffer.length, 2);
	});

	it("returns undefined when no steer messages exist", () => {
		const buffer = [
			makeMsg("follow1", "followUp"),
			makeMsg("follow2", "followUp"),
		];
		const msg = shiftNextSteer(buffer);
		assert.equal(msg, undefined);
		assert.equal(buffer.length, 2);
	});

	it("returns undefined for empty buffer", () => {
		const buffer: BufferedMessage[] = [];
		const msg = shiftNextSteer(buffer);
		assert.equal(msg, undefined);
	});

	it("prioritizes first steer over later steers", () => {
		const buffer = [
			makeMsg("follow1", "followUp"),
			makeMsg("steer1", "steer"),
			makeMsg("steer2", "steer"),
		];
		const msg = shiftNextSteer(buffer);
		assert.equal(msg?.text, "steer1");
		assert.equal(buffer.length, 2);
		assert.equal(buffer[0].text, "follow1");
		assert.equal(buffer[1].text, "steer2");
	});

	it("removes only the steer message, preserves order of others", () => {
		const buffer = [
			makeMsg("a", "followUp"),
			makeMsg("b", "steer"),
			makeMsg("c", "followUp"),
			makeMsg("d", "steer"),
		];
		shiftNextSteer(buffer);
		assert.equal(buffer.length, 3);
		assert.deepEqual(
			buffer.map((m) => m.text),
			["a", "c", "d"]
		);
	});
});

describe("updateWidget", () => {
	it("clears widget when buffer is empty", () => {
		let widgetValue: any = "not-cleared";
		const fakeUi = {
			setWidget: (_key: string, value: any) => {
				widgetValue = value;
			},
		};
		updateWidget(fakeUi, []);
		assert.equal(widgetValue, undefined);
	});

	it("sets widget factory when buffer has items", () => {
		let widgetFactory: any = null;
		const fakeUi = {
			setWidget: (_key: string, value: any) => {
				widgetFactory = value;
			},
		};
		updateWidget(fakeUi, [makeMsg("test", "steer")]);
		assert.equal(typeof widgetFactory, "function");
	});

	it("does nothing when ui is null", () => {
		// Should not throw
		updateWidget(null, [makeMsg("test")]);
	});
});
