// Makes a nethermind log line safe to show in the blessed log box.
//
// Nethermind decorates its log lines with emoji (a fuel pump on "Processed",
// a link on "Block throughput", fire, sparkles and pointing hands elsewhere),
// and a block's "Extra Data" can contain any character a builder put there.
// Blessed counts each of these as one column while the terminal draws most of
// them two columns wide (and blessed shows the 4-byte ones as "?"), so the
// rest of the line lands one column off from where blessed thinks it is.
// Blessed redraws only the cells it thinks changed, so text left behind in
// those columns is never cleared: stray characters that stay put on screen
// while the log scrolls.
//
// Only the displayed text is cleaned; the log file and the parsers that read
// lines (sync stages, block numbers) see nethermind's output unchanged.

// Nethermind's gas limit arrows: keep their meaning in plain text.
const REPLACEMENTS = [
  [/\u{1F446}/gu, "(up)"], // pointing up: gas limit raised
  [/\u{1F447}/gu, "(down)"], // pointing down: gas limit lowered
];

// What can't be shown at a width blessed agrees with:
// - emoji and pictographs, with their variation selectors and joiners
// - characters outside the Basic Multilingual Plane (blessed shows "?")
// - East Asian wide and fullwidth characters (CJK, Hangul, fullwidth forms)
// - control and invisible format characters (\r, escapes, U+0603 and the like)
const UNSHOWABLE = new RegExp(
  [
    "\\p{Extended_Pictographic}",
    "\\p{Emoji_Presentation}",
    "[\\u{FE00}-\\u{FE0F}\\u{200D}\\u{20E3}]",
    "[\\u{10000}-\\u{10FFFF}]",
    "[\\u{1100}-\\u{115F}\\u{2E80}-\\u{303E}\\u{3041}-\\u{33FF}\\u{3400}-\\u{4DBF}\\u{4E00}-\\u{9FFF}\\u{A000}-\\u{A4CF}\\u{AC00}-\\u{D7A3}\\u{F900}-\\u{FAFF}\\u{FE30}-\\u{FE4F}\\u{FF00}-\\u{FF60}\\u{FFE0}-\\u{FFE6}]",
    "[\\p{Cc}\\p{Cf}]",
  ].join("|"),
  "gu"
);

export function cleanNethermindLogLine(line) {
  let text = line.replace(/\t/g, " ");
  for (const [pattern, replacement] of REPLACEMENTS) {
    text = text.replace(pattern, replacement);
  }
  return text.replace(UNSHOWABLE, "");
}
