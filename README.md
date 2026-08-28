# Frame Cleaner

A Figma plugin that takes a frame and rebuilds it with the fewest auto-layout layers it can get away with.

Files get built fast. Wrappers pile up, somebody nests a frame to fix one alignment problem, and three weeks later six layers are doing the work of two. It still looks right, it's just miserable to edit. Run this before you hand the file to someone else.

On [Figma Community](https://www.figma.com/community/plugin/1546639159666408069/frame-cleaner).

## How it works

Select a frame. The plugin walks the tree and tells you how many frames are in there and how many it thinks it can remove, with the list of which ones and what the parent would inherit from each. You see the proposal before anything changes. Then you press the button.

What it collapses:

- **Redundant wrappers.** A frame whose layout properties the parent can absorb: padding, alignment, sizing mode, item spacing, layout direction. The wrapper goes, the parent inherits.
- **Sibling groups.** Frames sitting next to each other that were only grouped to share a property.
- **Nested padding.** Padding spread across layers that adds up to one value the parent can hold on its own.

Style IDs survive the merge. If a fill is bound to a design token, the token moves up instead of getting flattened into a hex value.

## What it won't touch

This is the part that took the longest. The plugin refuses to merge rather than risk breaking your file, and it tells you which check stopped it. It backs off when it finds:

- transforms or rotation
- gradients or image fills
- complex strokes
- prototype interactions
- advanced layout modes
- fills that aren't compatible between parent and child
- a child with a stroke, an effect, or a corner radius where the dimensions differ
- a child with opacity below 1

If you get `Cannot merge` with a reason after it, that's this list talking.

## Deep Optimise

On by default. It's more aggressive about sibling merges and padding collapse, and it's where most of the frames-removed count comes from.

Turn it off if you see a visual shift after a run. That's the same instruction the plugin gives you in the panel, and it's there because deep mode can still get a padding sum wrong on siblings with inconsistent values. A switch you control beats me pretending that doesn't happen.

## Privacy

No network calls. `manifest.json` sets `networkAccess.allowedDomains` to `["none"]`, so it couldn't phone home even if I wanted it to. Nothing about your file leaves Figma.

## Build it yourself

```bash
npm install
npm run watch
```

Then in Figma: **Plugins → Development → Import plugin from manifest**, and pick `manifest.json`. Needs the desktop app.

`npm run build` compiles once instead of watching. `code.js` is generated and gitignored, so a fresh clone has to build before Figma will run it.

## Guide and bugs

There's a [full user guide](https://www.notion.so/Frame-Cleaner-Plugin-Complete-User-Guide-268738f28993818185e0eeb360ae79b7) with screenshots.

Found something broken? [Report it here](https://docs.google.com/forms/d/e/1FAIpQLScMlpEqSqvdDTgUI-NxKuZDFl-yx8wNg73UIUD-V1IT0knyEQ/viewform). I read them.

## Licence

MIT. See [LICENSE](LICENSE).
