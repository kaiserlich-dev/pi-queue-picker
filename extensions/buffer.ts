import { truncateToWidth } from "@mariozechner/pi-tui";
import type { BufferedMessage } from "./types";

/**
 * Add a message to the buffer.
 */
export function addMessage(buffer: BufferedMessage[], msg: BufferedMessage): void {
	buffer.push(msg);
}

/**
 * Shift the next message from the front of the buffer.
 * Used when flushing queued messages after agent finishes.
 */
export function shiftNext(buffer: BufferedMessage[]): BufferedMessage | undefined {
	return buffer.shift();
}

/**
 * Find and remove the first "steer" message from the buffer.
 * Steer messages should interrupt immediately even while agent is busy.
 */
export function shiftNextSteer(buffer: BufferedMessage[]): BufferedMessage | undefined {
	const index = buffer.findIndex((m) => m.mode === "steer");
	if (index === -1) return undefined;
	return buffer.splice(index, 1)[0];
}

/**
 * Update the queue widget display.
 * Shows a summary of buffered messages below the editor, or clears it if empty.
 */
export function updateWidget(ui: any, buffer: BufferedMessage[]): void {
	if (!ui) return;
	if (buffer.length === 0) {
		ui.setWidget("queue-picker", undefined);
		return;
	}
	ui.setWidget(
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
