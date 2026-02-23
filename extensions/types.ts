export type Theme = Parameters<
	Parameters<import("@mariozechner/pi-coding-agent").ExtensionUIContext["custom"]>[0]
>[1];

export type PickerMode = "steer" | "followUp";

export interface BufferedMessage {
	text: string;
	mode: PickerMode;
	id: string;
}

let idCounter = 0;
export function nextId(): string {
	return `qp-${Date.now()}-${idCounter++}`;
}

export type ModePickerAction =
	| { type: "select"; mode: PickerMode }
	| { type: "cancel" };

export type QueueEditorAction =
	| { type: "save"; items: BufferedMessage[] }
	| { type: "cancel" };
