import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { shouldBypassPicker } from "../queue-picker";

describe("shouldBypassPicker", () => {
	it("bypasses slash commands", () => {
		assert.equal(shouldBypassPicker("/model"), true);
		assert.equal(shouldBypassPicker("/model q"), true);
		assert.equal(shouldBypassPicker("/settings"), true);
		assert.equal(shouldBypassPicker("/skill:deep-research"), true);
	});

	it("does not bypass normal messages", () => {
		assert.equal(shouldBypassPicker("help me with this"), false);
		assert.equal(shouldBypassPicker("  follow up after this"), false);
	});

	it("does not treat path-like tokens as commands", () => {
		assert.equal(shouldBypassPicker("/tmp/build.log"), false);
		assert.equal(shouldBypassPicker("/Users/julian/code"), false);
	});
});
