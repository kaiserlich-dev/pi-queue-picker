# pi-queue-picker

A [pi](https://github.com/mariozechner/pi) extension that lets you choose between **Steer** and **Follow-up** when queuing messages while the agent is busy.

## What it does

By default, pressing Enter while the agent is working queues your message as a "steer" (interrupts and redirects). This extension adds an interactive picker so you can choose:

- **Steer** — interrupt and redirect the agent
- **Follow-up** — queue for after the current task finishes

## Usage

When the agent is idle, Enter submits normally. When the agent is busy:

1. Type your message and press **Enter**
2. A picker appears: `● Steer  ○ Follow-up`
3. **Tab** to switch between modes
4. **Enter** to send with the selected mode
5. **Escape** to cancel (restores your text)

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
