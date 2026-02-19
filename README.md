# pi-queue-picker

A [pi](https://github.com/mariozechner/pi) extension that lets you choose between **Steer** and **Follow-up** when queuing messages while the agent is busy.

## What it does

By default, pressing Enter while the agent is working queues your message as a "steer" (interrupts and redirects). This extension adds an interactive picker so you can choose:

- **Steer** — interrupt and redirect the agent
- **Follow-up** — queue for after the current task finishes

Follow-up messages are **editable** — they're held in an internal buffer until the agent finishes, so you can change your mind before they're delivered.

## Usage

When the agent is idle, Enter submits normally. When the agent is busy:

1. Type your message and press **Enter**
2. A picker appears: `● Steer  ○ Follow-up`
3. **Tab** to switch between modes
4. **Enter** to send with the selected mode
5. **Escape** to cancel (restores your text)

The picker remembers your last chosen mode as the default.

### Editing queued follow-ups

Follow-up messages stay in an editable buffer until the agent finishes. To edit them:

- Press **Alt+Q** or type `/edit-queue`
- A floating popup overlay appears showing all buffered follow-ups
- **↑↓** to navigate between messages
- **Tab** to toggle mode (follow-up ↔ steer)
- **d** to delete a message
- **Enter** to confirm changes
- **Escape** to cancel

Messages toggled to **Steer** are sent immediately when you confirm. Deleted messages are discarded.

A widget above the editor shows buffered follow-ups:
```
  📋 Follow-up: also check the tests
  📋 Follow-up: and update the docs
  ↳ Alt+Q to edit queue
```

### How delivery works

- **Steer** messages are sent to pi immediately (they interrupt the agent)
- **Follow-up** messages are held in the extension's buffer and flushed one at a time when the agent finishes (`agent_end` event)
- If the agent finishes while the picker is shown, follow-ups are flushed immediately after selection

## Install

Add to your `~/.pi/settings.json`:

```json
{
  "packages": [
    "github:kaiserlich-dev/pi-queue-picker"
  ]
}
```

Then restart pi or run `/reload`.

## Compatibility

Works alongside other extensions that customize the editor (e.g. `pi-powerline-footer`). Uses the `input` event API instead of replacing the editor component.

### SSH / Mobile Terminals

The picker is automatically disabled over SSH (detected via `SSH_TTY`/`SSH_CONNECTION`), since mobile terminal apps like Terminus can't handle the custom TUI component. Messages fall through to the default steer behavior.

To manually disable the picker, set `PI_QUEUE_PICKER_DISABLE=1`.
