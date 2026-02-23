# @kaiserlich-dev/pi-queue-picker

A [pi](https://github.com/mariozechner/pi) extension that lets you choose between **Steer** and **Follow-up** when queuing messages while the agent is busy.

## What it does

By default, pressing Enter while the agent is working queues your message as a "steer" (interrupts and redirects). This extension adds an interactive picker so you can choose:

- **Steer** — interrupt and redirect the agent
- **Follow-up** — queue for after the current task finishes

Queued follow-ups are **editable** in an internal buffer, so you can change mode and order before delivery.

## Usage

When the agent is idle, Enter submits normally. When the agent is busy:

1. Type your message and press **Enter**
2. A centered delivery popup appears with **Steer** and **Follow-up** options
3. **Tab** or **↑↓** to switch between modes
4. **Enter** to send with the selected mode
5. **Escape** to cancel (restores your text)

The picker remembers your last chosen mode as the default.

### Editing queued messages

Queued messages stay in an editable buffer until the agent finishes. To edit them:

- Press **Ctrl+J** or type `/edit-queue`
- A floating popup overlay appears showing all buffered queue items (steer + follow-up)
- **↑↓** to navigate between messages
- **Tab** to toggle mode (follow-up ↔ steer)
- **j / k** to move a message up/down (reorder)
- **e** to edit the selected message in an inline text box
- **d** or **Delete** to remove the selected message
- **Enter** to confirm queue changes (or save while editing)
- **Escape** to cancel (or exit edit mode)

Messages keep their selected mode and queue order when you confirm. Deleted messages are discarded.

A widget above the editor shows buffered queue items:
```
  ⚡ Steer: also check the tests
  📋 Follow-up: and update the docs
  ↳ Ctrl+J queue editor · e edit · d delete · j/k move
```

### How delivery works

- **Steer** messages are sent immediately (interrupt current task)
- **Follow-up** messages are buffered and flushed one at a time when the agent finishes (`agent_end` event)
- You can reorder items and toggle mode before they are sent
- If you change a queued item to **Steer** in the queue editor while the agent is busy, it is injected immediately after you save
- If the agent finishes while the picker is shown, the first queued item is flushed immediately after selection

### Regression test

Run the steer-injection regression test:

```bash
npm run test:regression
```

This launches pi in tmux with the local extension, reproduces the queue-edit toggle flow, and asserts that changing a queued item to **Steer** injects it immediately while the agent is still busy.

## Install

### npm (recommended)

```bash
pi install npm:@kaiserlich-dev/pi-queue-picker
```

### git (alternative)

```bash
pi install git:github.com/kaiserlich-dev/pi-queue-picker
```

> By default this writes to `~/.pi/agent/settings.json`. Use `-l` to install into `.pi/settings.json` for a project.

Then restart pi or run `/reload`.

## Development

```bash
# Run locally without installing
pi -e ./extensions/queue-picker.ts
```

## Compatibility

Works alongside other extensions that customize the editor (e.g. `pi-powerline-footer`). Uses the `input` event API instead of replacing the editor component.

### SSH / Mobile Terminals

The picker is automatically disabled over SSH (detected via `SSH_TTY`/`SSH_CONNECTION`), since mobile terminal apps like Terminus can't handle the custom TUI component. Messages fall through to the default steer behavior.

To manually disable the picker, set `PI_QUEUE_PICKER_DISABLE=1`.
