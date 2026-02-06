/**
 * Queue Picker — choose between steering and follow-up when queuing messages.
 *
 * When the agent is busy and you press Enter, a picker appears:
 *   - Tab to toggle between Steer and Follow-up
 *   - Enter to send with the selected mode
 *   - Escape to cancel and restore your text
 *
 * When the agent is idle, Enter submits normally.
 */

import { CustomEditor, type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { matchesKey, truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";

export default function (pi: ExtensionAPI) {
	let isAgentIdle = true;
	let pendingText: string | null = null;
	let queueMode: "steer" | "followUp" = "steer";
	let uiRef: { theme: any; setWidget: Function } | null = null;

	pi.on("agent_start", async (_event, ctx) => {
		isAgentIdle = false;
		uiRef = ctx.ui;
	});

	pi.on("agent_end", async (_event, ctx) => {
		isAgentIdle = true;
		uiRef = ctx.ui;
	});

	function updateWidget() {
		if (!uiRef) return;
		const t = uiRef.theme;
		const steer =
			queueMode === "steer"
				? t.bold(t.fg("accent", "● Steer"))
				: t.fg("dim", "○ Steer");
		const follow =
			queueMode === "followUp"
				? t.bold(t.fg("accent", "● Follow-up"))
				: t.fg("dim", "○ Follow-up");
		const hint = t.fg("muted", "Tab switch · Enter send · Esc cancel");
		uiRef.setWidget("queue-picker", [`  ${steer}  ${follow}    ${hint}`]);
	}

	function clearWidget() {
		uiRef?.setWidget("queue-picker", undefined);
	}

	class QueuePickerEditor extends CustomEditor {
		handleInput(data: string): void {
			// — Queue mode selection (pending message) —
			if (pendingText !== null) {
				if (matchesKey(data, "tab")) {
					queueMode = queueMode === "steer" ? "followUp" : "steer";
					updateWidget();
					return;
				}
				if (matchesKey(data, "return")) {
					const text = pendingText;
					pendingText = null;
					clearWidget();
					if (isAgentIdle) {
						pi.sendUserMessage(text);
					} else {
						pi.sendUserMessage(text, { deliverAs: queueMode });
					}
					queueMode = "steer";
					return;
				}
				if (matchesKey(data, "escape")) {
					this.setText(pendingText);
					pendingText = null;
					clearWidget();
					queueMode = "steer";
					return;
				}
				// Swallow all other keys while picking
				return;
			}

			// — Intercept Enter when agent is busy —
			if (
				matchesKey(data, "return") &&
				!isAgentIdle &&
				!this.isShowingAutocomplete()
			) {
				const text = this.getText();
				if (text.trim()) {
					pendingText = text;
					this.setText("");
					queueMode = "steer";
					updateWidget();
					return;
				}
			}

			// — Default editor behavior —
			super.handleInput(data);
		}

		render(width: number): string[] {
			const lines = super.render(width);
			if (pendingText !== null && lines.length > 0) {
				const label =
					queueMode === "steer" ? " ▸ STEER " : " ▸ FOLLOW-UP ";
				const last = lines.length - 1;
				if (visibleWidth(lines[last]!) >= label.length) {
					lines[last] =
						truncateToWidth(lines[last]!, width - label.length, "") +
						this.borderColor(label);
				}
			}
			return lines;
		}
	}

	pi.on("session_start", (_event, ctx) => {
		uiRef = ctx.ui;
		ctx.ui.setEditorComponent((tui, theme, kb) => new QueuePickerEditor(tui, theme, kb));
	});

	pi.on("session_switch", (_event, ctx) => {
		uiRef = ctx.ui;
		pendingText = null;
		queueMode = "steer";
		clearWidget();
	});
}
