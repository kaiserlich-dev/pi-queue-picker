# @kaiserlich-dev/pi-queue-picker

A [pi](https://github.com/mariozechner/pi) extension that lets you choose between **Steer** and **Follow-up** when queuing messages while the agent is busy.

## What it does

By default, pressing Enter while the agent is working queues your message as a "steer" (interrupts and redirects). This extension adds an interactive picker so you can choose:

- **Steer** — interrupt and redirect the agent
- **Follow-up** — queue for after the current task finishes

Queued messages are **editable** — both steer and follow-up items are held in an internal buffer, so you can change mode and order before delivery.

## Usage

When the agent is idle, Enter submits normally. When the agent is busy:

1. Type your message and press **Enter**
2. A picker appears: `● Steer  ○ Follow-up`
3. **Tab** to switch between modes
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
- **d** to delete a message
- **Enter** to confirm changes
- **Escape** to cancel

Messages keep their selected mode and queue order when you confirm. Deleted messages are discarded.

A widget above the editor shows buffered queue items:
```
  ⚡ Steer: also check the tests
  📋 Follow-up: and update the docs
  ↳ Ctrl+J edit queue · j/k reorder
```

### How delivery works

- Both **Steer** and **Follow-up** messages are buffered while the agent is busy
- Queue items are flushed one at a time when the agent finishes (`agent_end` event)
- You can reorder items and toggle mode before they are sent
- If the agent finishes while the picker is shown, the first queued item is flushed immediately after selection

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

## Compatibility

Works alongside other extensions that customize the editor (e.g. `pi-powerline-footer`). Uses the `input` event API instead of replacing the editor component.

### SSH / Mobile Terminals

The picker is automatically disabled over SSH (detected via `SSH_TTY`/`SSH_CONNECTION`), since mobile terminal apps like Terminus can't handle the custom TUI component. Messages fall through to the default steer behavior.

To manually disable the picker, set `PI_QUEUE_PICKER_DISABLE=1`.
