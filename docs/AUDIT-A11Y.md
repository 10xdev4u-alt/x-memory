# Accessibility audit (panel and options)

Date of first pass with this checklist. Re-run on every UI milestone.

## Structure

- Zones expose tab, tablist, and tabpanel roles with labelled controls.
- Dialogs carry labels. Status updates use role status.
- Every button has a text name. No icon-only controls ship without labels.

## Keyboard

- Tabs move with arrows and activate on selection. Roving tabindex keeps one stop.
- Palette opens on Ctrl or Cmd K, closes on Escape, runs on Enter.
- Shortcuts 1 to 3 switch zones. Focus never traps.

## Visual

- Focus indicator is always visible with a 2px outline.
- Reduced-motion preference disables transitions.
- Dark scheme uses system palette contrast. Light scheme review is open under the theme issue.

## Findings and fixes

- Missing tablist role: fixed.
- Missing focus styles: fixed with styles.css.
- Light theme contrast: deferred to theme sync work.
