# Bundled PDF fonts

react-pdf embeds the font file itself, so every family a document can use has to
ship with the app rather than be named and hoped for.

All four are redistributable:

- `Roboto-*` — Apache License 2.0
- `NotoSerif-*`, `NotoSansMono-*` — SIL Open Font License 1.1

Each covers Latin, Greek and Cyrillic, which is why the PDF never falls back to
a built-in PDF font: those are Latin-1 only and would drop Cyrillic entirely.
