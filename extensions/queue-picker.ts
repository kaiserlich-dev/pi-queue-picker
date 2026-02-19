/**
 * Queue Picker — choose between steering and follow-up when queuing messages.
 *
 * When the agent is busy and you submit a message, a picker appears:
 *   - Tab to toggle between Steer and Follow-up
 *   - Enter to send with the selected mode
 *   - Escape to cancel and restore your text
 *
 * Follow-up messages are held in an internal buffer so you can edit them
 * before they're delivered. Press Alt+Q (or /edit-queue) to open a popup:
 *   - Toggle mode (follow-up → steer sends immediately)
 *   - Delete messages from the queue
 *
 * Follow-ups are flushed one at a time when the agent finishes.
 * Steer messages are sent immediately (they interrupt the agent).
 *
 * The picker remembers your last chosen mode as the default.
 *
 * When the agent is idle, messages submit normally.
 *
 * Uses the `input` event instead of a custom editor, so it's compatible
 * with other extensions that customize the editor (e.g. pi-powerline-footer).
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { matchesKey, visibleWidth } from "@mariozechner/pi-tui";

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

	function flushOneFollowUp(isIdle: boolean) {
		if (buffer.length === 0) return;
		const next = buffer.shift()!;
		sendToPi(next.text, isIdle, "followUp");
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
				const lines = buffer.map((msg) =>
					theme.fg(
						"dim",
						`  📋 Follow-up: ${msg.text}`
					)
				);
				lines.push(
					theme.fg(
						"dim",
						"  ↳ Alt+Q to edit queue"
					)
				);
				return {
					render: () => lines,
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
			ctx.ui.notify("No follow-up messages in queue", "info");
			return;
		}

		editingQueue = true;

		const result: BufferedMessage[] | null = await ctx.ui.custom(
			(
				tui: any,
				theme: any,
				_kb: any,
				done: (v: BufferedMessage[] | null) => void
			) => {
				let items = buffer.map((m) => ({ ...m }));
				let selected = 0;

				const BOX_WIDTH = 72;
				const innerW = BOX_WIDTH - 2;

				function pad(s: string, len: number): string {
					const vis = visibleWidth(s);
					return (
						s +
						" ".repeat(Math.max(0, len - vis))
					);
				}

				function row(content: string): string {
					return (
						theme.fg("border", "│") +
						pad(content, innerW) +
						theme.fg("border", "│")
					);
				}

				function truncate(
					s: string,
					max: number
				): string {
					if (s.length <= max) return s;
					return s.slice(0, max - 1) + "…";
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
						lines.push(row(""));

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

								const text = truncate(
									item.text,
									innerW - 18
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

						lines.push(row(""));

						// Help
						const help = [
							`${theme.fg("accent", "↑↓")} navigate`,
							`${theme.fg("accent", "Tab")} switch mode`,
							`${theme.fg("accent", "d")} delete`,
							`${theme.fg("accent", "Enter")} confirm`,
							`${theme.fg("accent", "Esc")} cancel`,
						].join(
							theme.fg("dim", "  ·  ")
						);
						lines.push(
							row(`  ${help}`)
						);

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

						if (
							matchesKey(data, "up") ||
							matchesKey(data, "k")
						) {
							selected = Math.max(
								0,
								selected - 1
							);
							tui.requestRender();
						} else if (
							matchesKey(data, "down") ||
							matchesKey(data, "j")
						) {
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
			{ overlay: true }
		);

		editingQueue = false;

		if (result === null) {
			return;
		}

		const newSteers = result.filter(
			(m: BufferedMessage) => m.mode === "steer"
		);
		const remainingFollowUps = result.filter(
			(m: BufferedMessage) => m.mode === "followUp"
		);

		buffer = remainingFollowUps;

		const isIdle = ctx.isIdle();
		for (const msg of newSteers) {
			sendToPi(msg.text, isIdle, "steer");
			ctx.ui.notify(`Steering: ${msg.text}`, "info");
		}

		updateWidget();

		if (ctx.isIdle() && buffer.length > 0) {
			flushOneFollowUp(true);
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
		flushOneFollowUp(ctx.isIdle());
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

				function render(_width: number): string[] {
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
					return [
						`  ${steer}  ${follow}    ${hint}`,
					];
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

		if (mode === "steer") {
			sendToPi(event.text, false, "steer");
			ctx.ui.notify(`Steering: ${event.text}`, "info");
		} else {
			buffer.push({
				text: event.text,
				mode: "followUp",
				id: nextId(),
			});
			updateWidget();
			ctx.ui.notify(
				`Queued follow-up: ${event.text}`,
				"info"
			);

			// If agent became idle while picker was shown, flush immediately
			if (ctx.isIdle()) {
				flushOneFollowUp(true);
			}
		}

		return { action: "handled" as const };
	});

	// --- Shortcut & Command ---

	pi.registerShortcut("alt+q", {
		description: "Edit queued follow-up messages",
		handler: (ctx) => editQueue(ctx),
	});

	pi.registerCommand("edit-queue", {
		description: "Edit queued follow-up messages",
		handler: (_args, ctx) => editQueue(ctx),
	});
}
