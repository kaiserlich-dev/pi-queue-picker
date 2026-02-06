/**
 * Queue Picker — choose between steering and follow-up when queuing messages.
 *
 * When the agent is busy and you submit a message, a picker appears:
 *   - Tab to toggle between Steer and Follow-up
 *   - Enter to send with the selected mode
 *   - Escape to cancel and restore your text
 *
 * When the agent is idle, messages submit normally.
 *
 * Uses the `input` event instead of a custom editor, so it's compatible
 * with other extensions that customize the editor (e.g. pi-powerline-footer).
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { matchesKey } from "@mariozechner/pi-tui";

export default function (pi: ExtensionAPI) {
	let uiRef: any = null;

	pi.on("session_start", (_event, ctx) => {
		uiRef = ctx.ui;
	});

	pi.on("session_switch", (_event, ctx) => {
		uiRef = ctx.ui;
	});

	pi.on("input", async (event, ctx) => {
		// Only intercept interactive input when agent is busy
		if (event.source !== "interactive" || ctx.isIdle()) {
			return { action: "continue" as const };
		}

		if (!ctx.hasUI || !event.text.trim()) {
			return { action: "continue" as const };
		}

		// Agent is busy — show the picker
		const mode = await ctx.ui.custom<"steer" | "followUp" | null>(
			(tui, theme, _kb, done) => {
				let selected: "steer" | "followUp" = "steer";

				function render(width: number): string[] {
					const steer =
						selected === "steer"
							? theme.bold(theme.fg("accent", "● Steer"))
							: theme.fg("dim", "○ Steer");
					const follow =
						selected === "followUp"
							? theme.bold(theme.fg("accent", "● Follow-up"))
							: theme.fg("dim", "○ Follow-up");
					const hint = theme.fg(
						"muted",
						"Tab switch · Enter send · Esc cancel"
					);
					return [`  ${steer}  ${follow}    ${hint}`];
				}

				return {
					render,
					invalidate() {},
					handleInput(data: string) {
						if (matchesKey(data, "tab")) {
							selected =
								selected === "steer" ? "followUp" : "steer";
							tui.requestRender();
						} else if (matchesKey(data, "return")) {
							done(selected);
						} else if (matchesKey(data, "escape")) {
							done(null);
						}
					},
				};
			}
		);

		if (mode === null) {
			// Cancelled — restore text to editor
			ctx.ui.setEditorText(event.text);
			return { action: "handled" as const };
		}

		// Send with the chosen mode
		pi.sendUserMessage(event.text, { deliverAs: mode });
		const label = mode === "steer" ? "Steering" : "Follow-up";
		ctx.ui.notify(`${label}: ${event.text}`, "info");
		return { action: "handled" as const };
	});
}
