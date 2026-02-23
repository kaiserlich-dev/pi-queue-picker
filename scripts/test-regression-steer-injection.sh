#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SESSION="qp-regression-$(date +%H%M%S)-$$"
OUT_DIR="$(mktemp -d -t qp-regression-XXXXXX)"

BOOT_FILE="$OUT_DIR/boot.txt"
BEFORE_FILE="$OUT_DIR/before-toggle.txt"
AFTER_FILE="$OUT_DIR/after-toggle.txt"
MID_FILE="$OUT_DIR/mid-busy.txt"

cleanup() {
	tmux kill-session -t "$SESSION" >/dev/null 2>&1 || true
}
trap cleanup EXIT

if ! command -v tmux >/dev/null 2>&1; then
	echo "FAIL: tmux not found in PATH"
	exit 1
fi

if ! command -v pi >/dev/null 2>&1; then
	echo "FAIL: pi not found in PATH"
	exit 1
fi

if ! command -v rg >/dev/null 2>&1; then
	echo "FAIL: rg not found in PATH"
	exit 1
fi

capture() {
	local file="$1"
	tmux capture-pane -pt "$SESSION" -S -260 > "$file"
}

wait_for() {
	local pattern="$1"
	local file="$2"
	local timeout_s="${3:-20}"
	local tries=$((timeout_s * 2))

	for _ in $(seq 1 "$tries"); do
		capture "$file"
		if rg -q "$pattern" "$file"; then
			return 0
		fi
		sleep 0.5
	done

	return 1
}

# 1) Start pi with local extension source

tmux new-session -d -s "$SESSION" "cd '$ROOT_DIR' && pi -e ./extensions/queue-picker.ts"
if ! wait_for "Loaded" "$BOOT_FILE" 30; then
	echo "FAIL: pi did not boot in time"
	echo "Evidence: $BOOT_FILE"
	exit 1
fi

# 2) Put agent in busy state long enough for deterministic interaction
tmux send-keys -t "$SESSION" C-u
tmux send-keys -t "$SESSION" 'Run bash command: sleep 25 && echo done' Enter

if ! wait_for "Working|Thinking|\$ sleep 25" "$BOOT_FILE" 20; then
	echo "FAIL: agent did not enter busy state"
	echo "Evidence: $BOOT_FILE"
	exit 1
fi

# 3) Queue a follow-up message (force follow-up explicitly)
tmux send-keys -t "$SESSION" C-u
tmux send-keys -t "$SESSION" 'alpha' Enter
sleep 0.5
tmux send-keys -t "$SESSION" Right
sleep 0.2
tmux send-keys -t "$SESSION" Enter

if ! wait_for "Queued follow-up: alpha|📋 Follow-up: alpha" "$BEFORE_FILE" 20; then
	echo "FAIL: follow-up was not queued before toggle"
	echo "Evidence: $BEFORE_FILE"
	exit 1
fi

# 4) Open queue editor, toggle selected item to steer, save
tmux send-keys -t "$SESSION" C-u
tmux send-keys -t "$SESSION" '/edit-queue' Enter
sleep 0.7
tmux send-keys -t "$SESSION" Tab
sleep 0.2
tmux send-keys -t "$SESSION" Enter

if ! wait_for "Steering: alpha" "$AFTER_FILE" 20; then
	echo "FAIL: no immediate 'Steering: alpha' after save"
	echo "Evidence: $AFTER_FILE"
	exit 1
fi

# 5) Capture while still busy to verify immediate steer injection
sleep 3
capture "$MID_FILE"

if ! rg -q "Steering: alpha" "$MID_FILE"; then
	echo "FAIL: steer injection not visible while agent is still busy"
	echo "Evidence: $MID_FILE"
	exit 1
fi

echo "PASS: regression test verified immediate steer injection after queue edit"
echo "Evidence files:"
echo "- $BOOT_FILE"
echo "- $BEFORE_FILE"
echo "- $AFTER_FILE"
echo "- $MID_FILE"
