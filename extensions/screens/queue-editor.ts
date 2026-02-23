import { Input, Key, matchesKey, truncateToWidth } from "@mariozechner/pi-tui";
import type { Theme, BufferedMessage, QueueEditorAction } from "../types";
import { makeBox } from "../lib/render-helpers";

export interface QueueEditorState {
	items: BufferedMessage[];
	selected: number;
	mode: "list" | "edit";
	editInput: Input;
}

/**
 * Create a new queue editor state.
 * Clones the buffer items so edits don't affect the original until saved.
 * Wires up the Input component's onSubmit/onEscape callbacks to manage mode transitions.
 */
export function createQueueEditorState(items: BufferedMessage[]): QueueEditorState {
	const editInput = new Input();
	const state: QueueEditorState = {
		items: items.map((m) => ({ ...m })),
		selected: 0,
		mode: "list",
		editInput,
	};

	editInput.onSubmit = (value: string) => {
		if (state.items.length === 0) {
			state.mode = "list";
			return;
		}
		const updated = value.trim();
		if (updated.length > 0) {
			state.items[state.selected].text = updated;
		}
		state.mode = "list";
	};

	editInput.onEscape = () => {
		state.mode = "list";
	};

	return state;
}

/**
 * Open the inline editor for the currently selected item.
 */
function openEditor(state: QueueEditorState): void {
	if (state.items.length === 0) return;
	state.mode = "edit";
	state.editInput.setValue(state.items[state.selected].text);
	// Place cursor at end so appending extra context is frictionless.
	state.editInput.handleInput("\u0005"); // Ctrl+E
}

/**
 * Handle input for the queue editor overlay.
 * In edit mode, delegates to the Input component.
 * In list mode, processes navigation, reorder, toggle, delete, save, cancel.
 * Returns an action for save/cancel, otherwise mutates state and returns undefined.
 */
export function handleQueueEditorInput(
	state: QueueEditorState,
	data: string
): QueueEditorAction | undefined {
	if (state.items.length === 0) {
		if (matchesKey(data, "return") || matchesKey(data, "escape")) {
			return { type: "save", items: [] };
		}
		return;
	}

	if (state.mode === "edit") {
		state.editInput.handleInput(data);
		return;
	}

	// --- List mode ---

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
		if (state.selected > 0) {
			const [item] = state.items.splice(state.selected, 1);
			state.items.splice(state.selected - 1, 0, item);
			state.selected--;
		}
		return;
	}
	if (moveDown) {
		if (state.selected < state.items.length - 1) {
			const [item] = state.items.splice(state.selected, 1);
			state.items.splice(state.selected + 1, 0, item);
			state.selected++;
		}
		return;
	}
	if (matchesKey(data, "up")) {
		state.selected = Math.max(0, state.selected - 1);
		return;
	}
	if (matchesKey(data, "down")) {
		state.selected = Math.min(state.items.length - 1, state.selected + 1);
		return;
	}
	if (matchesKey(data, "tab")) {
		state.items[state.selected].mode =
			state.items[state.selected].mode === "steer" ? "followUp" : "steer";
		return;
	}
	if (
		data === "e" ||
		data === "E" ||
		matchesKey(data, "e") ||
		matchesKey(data, Key.shift("e"))
	) {
		openEditor(state);
		return;
	}
	if (
		data === "d" ||
		data === "D" ||
		matchesKey(data, "delete") ||
		matchesKey(data, "backspace")
	) {
		state.items.splice(state.selected, 1);
		state.selected = Math.min(state.selected, Math.max(0, state.items.length - 1));
		return;
	}
	if (matchesKey(data, "return")) {
		return { type: "save", items: state.items };
	}
	if (matchesKey(data, "escape")) {
		return { type: "cancel" };
	}
	return;
}

/**
 * Render the queue editor overlay.
 * @param state - Current editor state
 * @param width - Box width (rendered lines will be this wide)
 * @param theme - Theme for styling
 */
export function renderQueueEditor(
	state: QueueEditorState,
	width: number,
	theme: Theme
): string[] {
	const innerW = width - 2;
	const { row, emptyRow, divider, topBorder, bottomBorder } = makeBox(innerW, theme);

	const lines: string[] = [];

	lines.push(topBorder("Queue"));
	lines.push(emptyRow());
	lines.push(row(` ${theme.bold(theme.fg("accent", "📋 Queue Editor"))}`));
	lines.push(row(` ${theme.fg("dim", `${state.items.length} queued ${state.items.length === 1 ? "message" : "messages"}`)}`));
	lines.push(emptyRow());
	lines.push(divider());

	if (state.items.length === 0) {
		lines.push(emptyRow());
		lines.push(row(` ${theme.fg("muted", "Queue is empty")}`));
		lines.push(emptyRow());
	} else if (state.mode === "edit") {
		const item = state.items[state.selected];
		const modeTag =
			item.mode === "steer"
				? theme.bold(theme.fg("warning", "⚡ STEER"))
				: theme.bold(theme.fg("success", "📋 FOLLOW-UP"));

		lines.push(row(` ${theme.bold(theme.fg("accent", "✎ Edit message"))} ${theme.fg("dim", `#${state.selected + 1}`)}  ${modeTag}`));
		lines.push(emptyRow());

		for (const inputLine of state.editInput.render(Math.max(12, innerW - 4))) {
			lines.push(row(`  ${inputLine}`));
		}

		lines.push(emptyRow());
		lines.push(
			row(` ${theme.fg("muted", "Enter to save · Esc to cancel · Tip: append extra context at the end")}`)
		);
	} else {
		lines.push(emptyRow());
		for (let i = 0; i < state.items.length; i++) {
			const item = state.items[i];
			const isSel = i === state.selected;
			const prefix = isSel ? theme.fg("accent", "▸") : theme.fg("dim", "·");
			const indexTag = theme.fg("dim", `${String(i + 1).padStart(2, " ")}.`);
			const modeTag =
				item.mode === "steer"
					? theme.bold(theme.fg("warning", "STEER"))
					: theme.bold(theme.fg("success", "FOLLOW"));
			const textMaxW = Math.max(1, innerW - 25);
			const text = truncateToWidth(item.text, textMaxW);
			const textStyled = isSel ? theme.bold(theme.fg("accent", text)) : theme.fg("dim", text);

			lines.push(row(`  ${prefix} ${indexTag} ${modeTag}  ${textStyled}`));
		}
		lines.push(emptyRow());
	}

	lines.push(divider());

	const help =
		state.mode === "edit"
			? `${theme.fg("muted", "enter")} ${theme.fg("dim", "save")}  ${theme.fg("muted", "esc")} ${theme.fg("dim", "cancel edit")}`
			: `${theme.fg("muted", "↑↓")} ${theme.fg("dim", "nav")}  ${theme.fg("muted", "j/k")} ${theme.fg("dim", "move")}  ${theme.fg("muted", "tab")} ${theme.fg("dim", "mode")}  ${theme.fg("muted", "e")} ${theme.fg("dim", "edit")}  ${theme.fg("muted", "d/del")} ${theme.fg("dim", "remove")}  ${theme.fg("muted", "enter")} ${theme.fg("dim", "save")}  ${theme.fg("muted", "esc")} ${theme.fg("dim", "close")}`;

	lines.push(row(help));
	lines.push(bottomBorder());

	return lines;
}
