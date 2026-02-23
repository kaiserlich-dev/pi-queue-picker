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
import { Input, Key, matchesKey, truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";

/** Detect limited terminals (SSH from mobile apps like Terminus) where custom TUI components crash. */
function isLimitedTerminal(): boolean {
	if (process.env.PI_QUEUE_PICKER_DISABLE === "1") return true;
	if (process.env.SSH_TTY || process.env.SSH_CONNECTION) return true;
	return false;
}

interface BufferedMessage {
	text: string;
	mode: "steer" | "followUp";
	id: string;
}

let idCounter = 0;
function nextId(): string {
	return `qp-${Date.now()}-${idCounter++}`;
}

export default function (pi: ExtensionAPI) {
	let uiRef: any = null;
	let lastMode: "steer" | "followUp" = "steer";
	let buffer: BufferedMessage[] = [];
	let editingQueue = false;

	// --- Helpers ---

	/**
	 * Send a message to pi via sendUserMessage.
	 *
	 * pi.sendUserMessage() calls session.prompt() internally, which fires
	 * the input event. Our handler returns "continue" for non-interactive
	 * sources, so prompt() proceeds to queue/send the message normally.
	 */
	function sendToPi(
		text: string,
		isIdle: boolean,
		mode: "steer" | "followUp"
	) {
		if (isIdle) {
			pi.sendUserMessage(text);
		} else {
			pi.sendUserMessage(text, { deliverAs: mode });
		}
	}

	function flushOneQueuedMessage(isIdle: boolean) {
		if (buffer.length === 0) return;
		const next = buffer.shift()!;
		sendToPi(next.text, isIdle, next.mode);
		updateWidget();
	}

	/**
	 * While the agent is busy, steer items should interrupt immediately.
	 * Used after editing/toggling queued entries to "steer".
	 */
	function flushOneSteerWhileBusy() {
		const steerIndex = buffer.findIndex((m) => m.mode === "steer");
		if (steerIndex === -1) return;
		const [steerMsg] = buffer.splice(steerIndex, 1);
		sendToPi(steerMsg.text, false, "steer");
		updateWidget();
	}

	function updateWidget() {
		if (!uiRef) return;
		if (buffer.length === 0) {
			uiRef.setWidget("queue-picker", undefined);
			return;
		}
		uiRef.setWidget(
			"queue-picker",
			(_tui: any, theme: any) => {
				return {
					render: (width: number) => {
						const safeWidth = Math.max(1, width);
						const lines = buffer.map((msg) => {
							const prefix =
								msg.mode === "steer"
									? "⚡ Steer"
									: "📋 Follow-up";
							return truncateToWidth(
								theme.fg("dim", `  ${prefix}: ${msg.text}`),
								safeWidth
							);
						});
						lines.push(
							truncateToWidth(
								theme.fg("dim", "  ↳ Ctrl+J queue editor · e edit · d delete · j/k move"),
								safeWidth
							)
						);
						return lines;
					},
					invalidate() {},
				};
			}
		);
	}

	function clearBuffer() {
		buffer = [];
		updateWidget();
	}

	// --- Edit queue overlay popup ---

	async function editQueue(ctx: any) {
		if (buffer.length === 0) {
			ctx.ui.notify("No queued messages", "info");
			return;
		}

		editingQueue = true;

		const BOX_WIDTH = 76;

		const result: BufferedMessage[] | null = await ctx.ui.custom(
			(
				tui: any,
				theme: any,
				_kb: any,
				done: (v: BufferedMessage[] | null) => void
			) => {
				let items = buffer.map((m) => ({ ...m }));
				let selected = 0;
				let mode: "list" | "edit" = "list";
				const editInput = new Input();
				const innerW = BOX_WIDTH - 2;

				editInput.onSubmit = (value: string) => {
					if (items.length === 0) {
						mode = "list";
						tui.requestRender();
						return;
					}
					const updated = value.trim();
					if (updated.length > 0) {
						items[selected].text = updated;
					}
					mode = "list";
					tui.requestRender();
				};

				editInput.onEscape = () => {
					mode = "list";
					tui.requestRender();
				};

				const dim = (s: string) => `\x1b[2m${s}\x1b[22m`;
				const bold = (s: string) => `\x1b[1m${s}\x1b[22m`;
				const cyan = (s: string) => `\x1b[36m${s}\x1b[39m`;
				const green = (s: string) => `\x1b[32m${s}\x1b[39m`;
				const yellow = (s: string) => `\x1b[33m${s}\x1b[39m`;
				const italic = (s: string) => `\x1b[3m${s}\x1b[23m`;

				function row(content = ""): string {
					const clipped = truncateToWidth(content, innerW - 1, "");
					const vis = visibleWidth(clipped);
					const pad = Math.max(0, innerW - vis - 1);
					return dim("│") + " " + clipped + " ".repeat(pad) + dim("│");
				}

				function emptyRow(): string {
					return dim("│") + " ".repeat(innerW) + dim("│");
				}

				function divider(): string {
					return dim(`├${"─".repeat(innerW)}┤`);
				}

				function topBorder(title: string): string {
					const titleText = ` ${title} `;
					const borderLen = Math.max(0, innerW - titleText.length);
					const left = Math.floor(borderLen / 2);
					const right = borderLen - left;
					return dim(`╭${"─".repeat(left)}`) + dim(titleText) + dim(`${"─".repeat(right)}╮`);
				}

				function bottomBorder(): string {
					return dim(`╰${"─".repeat(innerW)}╯`);
				}

				function openEditor() {
					if (items.length === 0) return;
					mode = "edit";
					editInput.setValue(items[selected].text);
					// Place cursor at end so appending extra context is frictionless.
					editInput.handleInput("\u0005"); // Ctrl+E
				}

				return {
					render(_width: number): string[] {
						const lines: string[] = [];

						lines.push(topBorder("Queue"));
						lines.push(emptyRow());
						lines.push(row(` ${bold(cyan("📋 Queue Editor"))}`));
						lines.push(row(` ${dim(`${items.length} queued ${items.length === 1 ? "message" : "messages"}`)}`));
						lines.push(emptyRow());
						lines.push(divider());

						if (items.length === 0) {
							lines.push(emptyRow());
							lines.push(row(` ${dim(italic("Queue is empty"))}`));
							lines.push(emptyRow());
						} else if (mode === "edit") {
							const item = items[selected];
							const modeTag =
								item.mode === "steer"
									? bold(yellow("⚡ STEER"))
									: bold(green("📋 FOLLOW-UP"));

							lines.push(row(` ${bold(cyan("✎ Edit message"))} ${dim(`#${selected + 1}`)}  ${modeTag}`));
							lines.push(emptyRow());

							for (const inputLine of editInput.render(Math.max(12, innerW - 4))) {
								lines.push(row(`  ${inputLine}`));
							}

							lines.push(emptyRow());
							lines.push(
								row(` ${dim(italic("Enter to save · Esc to cancel · Tip: append extra context at the end"))}`)
							);
						} else {
							lines.push(emptyRow());
							for (let i = 0; i < items.length; i++) {
								const item = items[i];
								const isSel = i === selected;
								const prefix = isSel ? cyan("▸") : dim("·");
								const indexTag = dim(`${String(i + 1).padStart(2, " ")}.`);
								const modeTag =
									item.mode === "steer"
										? bold(yellow("STEER"))
										: bold(green("FOLLOW"));
								const textMaxW = Math.max(1, innerW - 25);
								const text = truncateToWidth(item.text, textMaxW);
								const textStyled = isSel ? bold(cyan(text)) : dim(text);

								lines.push(row(`  ${prefix} ${indexTag} ${modeTag}  ${textStyled}`));
							}
							lines.push(emptyRow());
						}

						lines.push(divider());

						const help =
							mode === "edit"
								? `${dim(italic("enter"))} ${dim("save")}  ${dim(italic("esc"))} ${dim("cancel edit")}`
								: `${dim(italic("↑↓"))} ${dim("nav")}  ${dim(italic("j/k"))} ${dim("move")}  ${dim(italic("tab"))} ${dim("mode")}  ${dim(italic("e"))} ${dim("edit")}  ${dim(italic("d/del"))} ${dim("remove")}  ${dim(italic("enter"))} ${dim("save")}  ${dim(italic("esc"))} ${dim("close")}`;

						lines.push(row(help));
						lines.push(bottomBorder());

						return lines;
					},
					invalidate() {},
					handleInput(data: string) {
						if (items.length === 0) {
							if (matchesKey(data, "return") || matchesKey(data, "escape")) {
								done([]);
							}
							return;
						}

						if (mode === "edit") {
							editInput.handleInput(data);
							tui.requestRender();
							return;
						}

						const moveUp =
							data === "k" ||
							data === "K" ||
							matchesKey(data, "k") ||
							matchesKey(data, Key.shift("k")) ||
							data === "\u001b[1;2A";
						const moveDown =
							data === "j" ||
							data === "J" ||
							matchesKey(data, "j") ||
							matchesKey(data, Key.shift("j")) ||
							data === "\u001b[1;2B";

						if (moveUp) {
							if (selected > 0) {
								const [item] = items.splice(selected, 1);
								items.splice(selected - 1, 0, item);
								selected--;
							}
							tui.requestRender();
						} else if (moveDown) {
							if (selected < items.length - 1) {
								const [item] = items.splice(selected, 1);
								items.splice(selected + 1, 0, item);
								selected++;
							}
							tui.requestRender();
						} else if (matchesKey(data, "up")) {
							selected = Math.max(0, selected - 1);
							tui.requestRender();
						} else if (matchesKey(data, "down")) {
							selected = Math.min(items.length - 1, selected + 1);
							tui.requestRender();
						} else if (matchesKey(data, "tab")) {
							items[selected].mode =
								items[selected].mode === "steer" ? "followUp" : "steer";
							tui.requestRender();
						} else if (
							data === "e" ||
							data === "E" ||
							matchesKey(data, "e") ||
							matchesKey(data, Key.shift("e"))
						) {
							openEditor();
							tui.requestRender();
						} else if (
							data === "d" ||
							data === "D" ||
							matchesKey(data, "delete") ||
							matchesKey(data, "backspace")
						) {
							items.splice(selected, 1);
							selected = Math.min(selected, Math.max(0, items.length - 1));
							tui.requestRender();
						} else if (matchesKey(data, "return")) {
							done(items);
						} else if (matchesKey(data, "escape")) {
							done(null);
						}
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
		updateWidget();

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
		// Only intercept interactive input when agent is busy.
		// Extension-sourced messages (from our sendUserMessage calls) pass
		// through to prompt() for normal queueing/delivery.
		if (event.source !== "interactive" || ctx.isIdle()) {
			return { action: "continue" as const };
		}

		if (!ctx.hasUI || !event.text.trim()) {
			return { action: "continue" as const };
		}

		if (isLimitedTerminal()) {
			return { action: "continue" as const };
		}

		// Agent is busy — show the picker
		const PICKER_WIDTH = 72;
		const mode = await ctx.ui.custom<"steer" | "followUp" | null>(
			(tui, _theme, _kb, done) => {
				let selected: "steer" | "followUp" = lastMode;
				const innerW = PICKER_WIDTH - 2;

				const dim = (s: string) => `\x1b[2m${s}\x1b[22m`;
				const bold = (s: string) => `\x1b[1m${s}\x1b[22m`;
				const cyan = (s: string) => `\x1b[36m${s}\x1b[39m`;
				const green = (s: string) => `\x1b[32m${s}\x1b[39m`;
				const yellow = (s: string) => `\x1b[33m${s}\x1b[39m`;
				const italic = (s: string) => `\x1b[3m${s}\x1b[23m`;

				function row(content = ""): string {
					const clipped = truncateToWidth(content, innerW - 1, "");
					const vis = visibleWidth(clipped);
					const pad = Math.max(0, innerW - vis - 1);
					return dim("│") + " " + clipped + " ".repeat(pad) + dim("│");
				}

				function emptyRow(): string {
					return dim("│") + " ".repeat(innerW) + dim("│");
				}

				function divider(): string {
					return dim(`├${"─".repeat(innerW)}┤`);
				}

				function topBorder(title: string): string {
					const titleText = ` ${title} `;
					const borderLen = Math.max(0, innerW - titleText.length);
					const left = Math.floor(borderLen / 2);
					const right = borderLen - left;
					return dim(`╭${"─".repeat(left)}`) + dim(titleText) + dim(`${"─".repeat(right)}╮`);
				}

				function bottomBorder(): string {
					return dim(`╰${"─".repeat(innerW)}╯`);
				}

				return {
					render(_width: number): string[] {
						const lines: string[] = [];

						lines.push(topBorder("Delivery"));
						lines.push(emptyRow());
						lines.push(row(` ${bold(cyan("↳ Deliver queued message as"))}`));
						lines.push(row(` ${dim(italic(truncateToWidth(event.text, innerW - 8, "…")))}`));
						lines.push(emptyRow());
						lines.push(divider());
						lines.push(emptyRow());

						const steerSel = selected === "steer";
						const followSel = selected === "followUp";

						lines.push(
							row(
								`  ${steerSel ? cyan("▸") : dim("·")} ${steerSel ? bold(cyan("⚡ STEER")) : bold(yellow("⚡ STEER"))}  ${dim("Interrupt and redirect now")}`
							)
						);
						lines.push(
							row(
								`  ${followSel ? cyan("▸") : dim("·")} ${followSel ? bold(cyan("📋 FOLLOW-UP")) : bold(green("📋 FOLLOW-UP"))}  ${dim("Run after current task")}`
							)
						);

						lines.push(emptyRow());
						lines.push(divider());
						lines.push(
							row(
								`${dim(italic("tab/↑↓"))} ${dim("switch")}  ${dim(italic("enter"))} ${dim("send")}  ${dim(italic("esc"))} ${dim("cancel")}`
							)
						);
						lines.push(bottomBorder());

						return lines;
					},
					invalidate() {},
					handleInput(data: string) {
						if (
							matchesKey(data, "tab") ||
							matchesKey(data, "up") ||
							matchesKey(data, "down")
						) {
							selected = selected === "steer" ? "followUp" : "steer";
							tui.requestRender();
						} else if (matchesKey(data, "left")) {
							selected = "steer";
							tui.requestRender();
						} else if (matchesKey(data, "right")) {
							selected = "followUp";
							tui.requestRender();
						} else if (matchesKey(data, "return")) {
							done(selected);
						} else if (matchesKey(data, "escape")) {
							done(null);
						}
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
			// Send immediately to interrupt the agent
			pi.sendUserMessage(event.text, { deliverAs: "steer" });
			ctx.ui.notify(`Steer: ${event.text}`, "info");
		} else {
			// Buffer follow-ups for delivery after agent finishes
			buffer.push({
				text: event.text,
				mode,
				id: nextId(),
			});
			updateWidget();
			ctx.ui.notify(
				`Queued follow-up: ${event.text}`,
				"info"
			);

			// If agent became idle while picker was shown, flush immediately
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
