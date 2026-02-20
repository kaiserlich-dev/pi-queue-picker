/**
 * Queue Picker — choose between steering and follow-up when queuing messages.
 *
 * When the agent is busy and you submit a message, a picker appears:
 *   - Tab to toggle between Steer and Follow-up
 *   - Enter to send with the selected mode
 *   - Escape to cancel and restore your text
 *
 * Queued messages are held in an internal buffer so you can edit them
 * before they're delivered. Press Ctrl+J (or /edit-queue) to open a popup:
 *   - Toggle mode (follow-up ↔ steer)
 *   - Reorder messages (j / k)
 *   - Delete messages from the queue
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
import { Key, matchesKey, truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";

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
		_isIdle: boolean,
		mode: "steer" | "followUp"
	) {
		pi.sendUserMessage(text, { deliverAs: mode });
	}

	function flushOneQueuedMessage(isIdle: boolean) {
		if (buffer.length === 0) return;
		const next = buffer.shift()!;
		sendToPi(next.text, isIdle, next.mode);
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
								theme.fg("dim", "  ↳ Ctrl+J edit queue · j/k reorder"),
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

		const BOX_WIDTH = 56;

		const result: BufferedMessage[] | null = await ctx.ui.custom(
			(
				tui: any,
				theme: any,
				_kb: any,
				done: (v: BufferedMessage[] | null) => void
			) => {
				let items = buffer.map((m) => ({ ...m }));
				let selected = 0;
				const innerW = BOX_WIDTH - 2;

				function pad(s: string, len: number): string {
					const vis = visibleWidth(s);
					return (
						s +
						" ".repeat(Math.max(0, len - vis))
					);
				}

				function row(content: string): string {
					const clipped = truncateToWidth(content, innerW, "");
					return (
						theme.fg("border", "│") +
						pad(clipped, innerW) +
						theme.fg("border", "│")
					);
				}

				return {
					render(_width: number): string[] {
						const lines: string[] = [];

						// Top border
						lines.push(
							theme.fg(
								"border",
								`╭${"─".repeat(innerW)}╮`
							)
						);

						// Title
						lines.push(
							row(
								` ${theme.bold(theme.fg("accent", "📋 Message Queue"))}`
							)
						);

						if (items.length === 0) {
							lines.push(
								row(
									`  ${theme.fg("dim", "Queue is empty")}`
								)
							);
						} else {
							for (
								let i = 0;
								i < items.length;
								i++
							) {
								const item = items[i];
								const isSel =
									i === selected;

								const cursor = isSel
									? theme.fg(
											"accent",
											" ❯ "
										)
									: "   ";

								const modeTag =
									item.mode === "steer"
										? theme.fg(
												"warning",
												"⚡ STEER "
											)
										: theme.fg(
												"success",
												"📋 FOLLOW"
											);

								const text = truncateToWidth(
									item.text,
									Math.max(1, innerW - 18)
								);
								const textStyled =
									isSel
										? theme.fg(
												"text",
												text
											)
										: theme.fg(
												"dim",
												text
											);

								lines.push(
									row(
										`${cursor}${modeTag}  ${textStyled}`
									)
								);
							}
						}

						// Keep help to one row so more queue items stay visible in short terminals
						const help = [
							`${theme.fg("accent", "↑↓")} nav`,
							`${theme.fg("accent", "j/k")} move`,
							`${theme.fg("accent", "Tab")} mode`,
							`${theme.fg("accent", "d")} del`,
							`${theme.fg("accent", "↵")} ok`,
							`${theme.fg("accent", "Esc")} cancel`,
						].join(theme.fg("dim", " · "));
						lines.push(row(` ${help}`));

						// Bottom border
						lines.push(
							theme.fg(
								"border",
								`╰${"─".repeat(innerW)}╯`
							)
						);

						return lines;
					},
					invalidate() {},
					handleInput(data: string) {
						if (items.length === 0) {
							if (
								matchesKey(
									data,
									"return"
								) ||
								matchesKey(
									data,
									"escape"
								)
							) {
								done([]);
							}
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
							selected = Math.max(
								0,
								selected - 1
							);
							tui.requestRender();
						} else if (matchesKey(data, "down")) {
							selected = Math.min(
								items.length - 1,
								selected + 1
							);
							tui.requestRender();
						} else if (matchesKey(data, "tab")) {
							items[selected].mode =
								items[selected].mode ===
								"steer"
									? "followUp"
									: "steer";
							tui.requestRender();
						} else if (
							data === "d" ||
							data === "D"
						) {
							items.splice(selected, 1);
							selected = Math.min(
								selected,
								Math.max(
									0,
									items.length - 1
								)
							);
							tui.requestRender();
						} else if (
							matchesKey(data, "return")
						) {
							done(items);
						} else if (
							matchesKey(data, "escape")
						) {
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
		const mode = await ctx.ui.custom<"steer" | "followUp" | null>(
			(tui, theme, _kb, done) => {
				let selected: "steer" | "followUp" = lastMode;

				function render(width: number): string[] {
					const steer =
						selected === "steer"
							? theme.bold(
									theme.fg(
										"accent",
										"● Steer"
									)
								)
							: theme.fg("dim", "○ Steer");
					const follow =
						selected === "followUp"
							? theme.bold(
									theme.fg(
										"accent",
										"● Follow-up"
									)
								)
							: theme.fg(
									"dim",
									"○ Follow-up"
								);
					const hint = theme.fg(
						"muted",
						"Tab switch · Enter send · Esc cancel"
					);
					const line = `  ${steer}  ${follow}    ${hint}`;
					return [truncateToWidth(line, Math.max(1, width))];
				}

				return {
					render,
					invalidate() {},
					handleInput(data: string) {
						if (matchesKey(data, "tab")) {
							selected =
								selected === "steer"
									? "followUp"
									: "steer";
							tui.requestRender();
						} else if (
							matchesKey(data, "return")
						) {
							done(selected);
						} else if (
							matchesKey(data, "escape")
						) {
							done(null);
						}
					},
				};
			}
		);

		if (mode === null) {
			ctx.ui.setEditorText(event.text);
			return { action: "handled" as const };
		}

		lastMode = mode;

		buffer.push({
			text: event.text,
			mode,
			id: nextId(),
		});
		updateWidget();
		ctx.ui.notify(
			mode === "steer"
				? `Queued steer: ${event.text}`
				: `Queued follow-up: ${event.text}`,
			"info"
		);

		// If agent became idle while picker was shown, flush immediately
		if (ctx.isIdle()) {
			flushOneQueuedMessage(true);
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
