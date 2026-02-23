import { matchesKey, truncateToWidth } from "@mariozechner/pi-tui";
import type { Theme, PickerMode, ModePickerAction } from "../types";
import { makeBox } from "../lib/render-helpers";

export interface ModePickerState {
	selected: PickerMode;
	messageText: string;
}

/**
 * Handle input for the mode picker overlay.
 * Returns an action when the user makes a selection or cancels,
 * otherwise mutates state and returns undefined.
 */
export function handleModePickerInput(
	state: ModePickerState,
	data: string
): ModePickerAction | undefined {
	if (
		matchesKey(data, "tab") ||
		matchesKey(data, "up") ||
		matchesKey(data, "down")
	) {
		state.selected = state.selected === "steer" ? "followUp" : "steer";
		return;
	}
	if (matchesKey(data, "left")) {
		state.selected = "steer";
		return;
	}
	if (matchesKey(data, "right")) {
		state.selected = "followUp";
		return;
	}
	if (matchesKey(data, "return")) {
		return { type: "select", mode: state.selected };
	}
	if (matchesKey(data, "escape")) {
		return { type: "cancel" };
	}
	return;
}

/**
 * Render the mode picker overlay.
 * @param state - Current picker state
 * @param width - Box width (rendered lines will be this wide)
 * @param theme - Theme for styling
 */
export function renderModePicker(
	state: ModePickerState,
	width: number,
	theme: Theme
): string[] {
	const innerW = width - 2;
	const { row, emptyRow, divider, topBorder, bottomBorder } = makeBox(innerW, theme);

	const lines: string[] = [];

	lines.push(topBorder("Delivery"));
	lines.push(emptyRow());
	lines.push(row(` ${theme.bold(theme.fg("accent", "↳ Deliver queued message as"))}`));
	lines.push(row(` ${theme.fg("muted", truncateToWidth(state.messageText, innerW - 8, "…"))}`));
	lines.push(emptyRow());
	lines.push(divider());
	lines.push(emptyRow());

	const steerSel = state.selected === "steer";
	const followSel = state.selected === "followUp";

	lines.push(
		row(
			`  ${steerSel ? theme.fg("accent", "▸") : theme.fg("dim", "·")} ${steerSel ? theme.bold(theme.fg("accent", "⚡ STEER")) : theme.bold(theme.fg("warning", "⚡ STEER"))}  ${theme.fg("dim", "Interrupt and redirect now")}`
		)
	);
	lines.push(
		row(
			`  ${followSel ? theme.fg("accent", "▸") : theme.fg("dim", "·")} ${followSel ? theme.bold(theme.fg("accent", "📋 FOLLOW-UP")) : theme.bold(theme.fg("success", "📋 FOLLOW-UP"))}  ${theme.fg("dim", "Run after current task")}`
		)
	);

	lines.push(emptyRow());
	lines.push(divider());
	lines.push(
		row(
			`${theme.fg("muted", "tab/↑↓")} ${theme.fg("dim", "switch")}  ${theme.fg("muted", "enter")} ${theme.fg("dim", "send")}  ${theme.fg("muted", "esc")} ${theme.fg("dim", "cancel")}`
		)
	);
	lines.push(bottomBorder());

	return lines;
}
