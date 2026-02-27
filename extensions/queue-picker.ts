/**
 * Queue Picker — choose between steering and follow-up when queuing messages.
 *
 * When the agent is busy and you submit a message, a picker appears:
 *   - Tab or ↑↓ to toggle between Steer and Follow-up
 *   - Enter to send with the selected mode
 *   - Escape to cancel and restore your text
 *
 * Queued messages are held in an internal buffer so you can edit them
 * before they're delivered. Press Ctrl+J (or /edit-queue) to open a popup:
 *   - Toggle mode (follow-up ↔ steer)
 *   - Reorder messages (j / k)
 *   - Edit a queued message inline (e)
 *   - Delete messages from the queue (d/delete)
 *
 * Queue items are flushed one at a time when the agent finishes.
 *
 * The picker remembers your last chosen mode as the default.
 *
 * When the agent is idle, messages submit normally.
 *
 * Uses the `input` event instead of a custom editor, so it's compatible
 * with other extensions that customize the editor (e.g. pi-powerline-footer).
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { BufferedMessage, PickerMode } from "./types";
import { nextId } from "./types";
import { addMessage, shiftNext, shiftNextSteer, updateWidget } from "./buffer";
import {
	handleModePickerInput,
	renderModePicker,
	type ModePickerState,
} from "./screens/mode-picker";
import {
	createQueueEditorState,
	handleQueueEditorInput,
	renderQueueEditor,
} from "./screens/queue-editor";

/** Detect limited terminals (SSH from mobile apps like Terminus) where custom TUI components crash. */
function isLimitedTerminal(): boolean {
	if (process.env.PI_QUEUE_PICKER_DISABLE === "1") return true;
	if (process.env.SSH_TTY || process.env.SSH_CONNECTION) return true;
	return false;
}

/**
 * Commands like /model, /settings, /skill:name should bypass the delivery picker.
 * They are interactive control flow, not chat content.
 */
export function shouldBypassPicker(text: string): boolean {
	const trimmed = text.trim();
	if (!trimmed.startsWith("/")) return false;

	const firstToken = trimmed.split(/\s+/, 1)[0];
	if (firstToken === "/") return true;

	// Commands are one slash-prefixed token without extra slashes, e.g. /model, /skill:name
	if (firstToken.slice(1).includes("/")) return false;
	return /^\/[a-z0-9:_-]+$/i.test(firstToken);
}

const PICKER_WIDTH = 72;
const BOX_WIDTH = 76;

export default function (pi: ExtensionAPI) {
	let uiRef: any = null;
	let lastMode: PickerMode = "steer";
	let buffer: BufferedMessage[] = [];
	let editingQueue = false;

	// --- Helpers ---

	function sendToPi(text: string, isIdle: boolean, mode: PickerMode) {
		if (isIdle) {
			pi.sendUserMessage(text);
		} else {
			pi.sendUserMessage(text, { deliverAs: mode });
		}
	}

	function flushOneQueuedMessage(isIdle: boolean) {
		const next = shiftNext(buffer);
		if (!next) return;
		sendToPi(next.text, isIdle, next.mode);
		updateWidget(uiRef, buffer);
	}

	function flushOneSteerWhileBusy() {
		const steerMsg = shiftNextSteer(buffer);
		if (!steerMsg) return;
		sendToPi(steerMsg.text, false, "steer");
		updateWidget(uiRef, buffer);
	}

	function clearBuffer() {
		buffer = [];
		updateWidget(uiRef, buffer);
	}

	// --- Edit queue overlay popup ---

	async function editQueue(ctx: any) {
		if (buffer.length === 0) {
			ctx.ui.notify("No queued messages", "info");
			return;
		}

		editingQueue = true;

		const editorState = createQueueEditorState(buffer);

		const result: BufferedMessage[] | null = await ctx.ui.custom(
			(
				tui: any,
				theme: any,
				_kb: any,
				done: (v: BufferedMessage[] | null) => void
			) => {
				return {
					render(_width: number): string[] {
						return renderQueueEditor(editorState, BOX_WIDTH, theme);
					},
					invalidate() {},
					handleInput(data: string) {
						const action = handleQueueEditorInput(editorState, data);
						if (action) {
							switch (action.type) {
								case "save":
									done(action.items);
									return;
								case "cancel":
									done(null);
									return;
							}
						}
						tui.requestRender();
					},
				};
			},
			{
				overlay: true,
				overlayOptions: {
					anchor: "center" as any,
					width: BOX_WIDTH + 2,
				},
			}
		);

		editingQueue = false;

		if (result === null) {
			return;
		}

		buffer = result;
		updateWidget(uiRef, buffer);

		if (ctx.isIdle() && buffer.length > 0) {
			flushOneQueuedMessage(true);
		} else if (!ctx.isIdle()) {
			flushOneSteerWhileBusy();
		}
	}

	// --- Events ---

	pi.on("session_start", (_event, ctx) => {
		uiRef = ctx.ui;
		clearBuffer();
	});

	pi.on("session_switch", (_event, ctx) => {
		uiRef = ctx.ui;
		clearBuffer();
	});

	pi.on("agent_end", async (_event, ctx) => {
		if (editingQueue || buffer.length === 0) return;
		flushOneQueuedMessage(ctx.isIdle());
	});

	pi.on("input", async (event, ctx) => {
		if (event.source !== "interactive" || ctx.isIdle()) {
			return { action: "continue" as const };
		}

		if (!ctx.hasUI || !event.text.trim()) {
			return { action: "continue" as const };
		}

		if (shouldBypassPicker(event.text)) {
			return { action: "continue" as const };
		}

		if (isLimitedTerminal()) {
			return { action: "continue" as const };
		}

		// Agent is busy — show the picker
		const pickerState: ModePickerState = {
			selected: lastMode,
			messageText: event.text,
		};

		const mode = await ctx.ui.custom<PickerMode | null>(
			(tui, theme, _kb, done) => {
				return {
					render(_width: number): string[] {
						return renderModePicker(pickerState, PICKER_WIDTH, theme);
					},
					invalidate() {},
					handleInput(data: string) {
						const action = handleModePickerInput(pickerState, data);
						if (action) {
							switch (action.type) {
								case "select":
									done(action.mode);
									return;
								case "cancel":
									done(null);
									return;
							}
						}
						tui.requestRender();
					},
				};
			},
			{
				overlay: true,
				overlayOptions: {
					anchor: "center" as any,
					width: PICKER_WIDTH + 2,
				},
			}
		);

		if (mode === null) {
			ctx.ui.setEditorText(event.text);
			return { action: "handled" as const };
		}

		lastMode = mode;

		if (mode === "steer") {
			pi.sendUserMessage(event.text, { deliverAs: "steer" });
			ctx.ui.notify(`Steer: ${event.text}`, "info");
		} else {
			addMessage(buffer, {
				text: event.text,
				mode,
				id: nextId(),
			});
			updateWidget(uiRef, buffer);
			ctx.ui.notify(
				`Queued follow-up: ${event.text}`,
				"info"
			);

			if (ctx.isIdle()) {
				flushOneQueuedMessage(true);
			}
		}

		return { action: "handled" as const };
	});

	// --- Shortcut & Command ---

	pi.registerShortcut("ctrl+j", {
		description: "Edit queued messages",
		handler: (ctx) => editQueue(ctx),
	});

	pi.registerCommand("edit-queue", {
		description: "Edit queued messages",
		handler: (_args, ctx) => editQueue(ctx),
	});
}
