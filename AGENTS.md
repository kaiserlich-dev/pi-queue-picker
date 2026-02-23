# Pi Queue Picker

## Published npm package

This is a published npm package: `@kaiserlich-dev/pi-queue-picker`

**When you add features, fix bugs, or change behavior:**
1. Update `README.md` to reflect the change
2. Bump version in `package.json` (`npm version patch|minor|major --no-git-tag-version`)
3. After pushing, publish with `npm run publish:pi`

Use **patch** for bug fixes, **minor** for new features, **major** for breaking changes.

## Testing

- `npx tsc --noEmit` — must pass before every commit
- `node --import tsx extensions/__tests__/mode-picker.test.ts` — mode picker input handling
- `node --import tsx extensions/__tests__/queue-editor.test.ts` — queue editor input handling
- `node --import tsx extensions/__tests__/buffer.test.ts` — buffer operations
- Use the `tmux-feature-test` skill for TUI behavior testing — compile checks alone are not sufficient for a TUI extension

## Architecture

Screen module pattern (from pi-subagents):
- `screens/*.ts` — each exports State, handleInput() → Action, render()
- `lib/render-helpers.ts` — theme-aware box drawing
- `queue-picker.ts` — thin entry: lifecycle + events only
- All rendering uses `theme.fg()` — no raw ANSI escapes
