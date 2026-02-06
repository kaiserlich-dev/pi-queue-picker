# pi-queue-picker

A [pi](https://github.com/badlogic/pi-mono) extension that replaces the default queue behavior with an interactive picker. Instead of memorizing separate shortcuts for steering vs follow-up, just press **Enter** — if the agent is busy, a picker appears.

## How it works

| Agent state | Enter does... |
|-------------|---------------|
| **Idle** | Submits normally (no change) |
| **Busy** | Opens the queue picker |

When the picker is open:

| Key | Action |
|-----|--------|
| **Tab** | Toggle between *Steer* and *Follow-up* |
| **Enter** | Send with the selected mode |
| **Escape** | Cancel and restore your text |

**Steer** interrupts the agent after the current tool call (default).
**Follow-up** waits until the agent finishes all work before delivering your message.

A mode indicator appears in a widget above the editor and in the editor border while picking.

## Install

```bash
pi install git:github.com/kaiserlich-dev/pi-queue-picker
```

Or try it without installing:

```bash
pi -e git:github.com/kaiserlich-dev/pi-queue-picker
```

## Uninstall

```bash
pi remove git:github.com/kaiserlich-dev/pi-queue-picker
```

## License

MIT
