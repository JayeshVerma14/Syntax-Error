/** Acceptance rows for the word wall. */

import type { ToolcraftComponentAcceptance } from "../acceptance/types";
import { wallTargets } from "../engine/engine-wall";
import { controlBrowser } from "./acceptance-browser";

const fixture = "terminal look with Word wall on";

type Row = Omit<ToolcraftComponentAcceptance, "automated" | "browser" | "kind"> & {
  browserName: string;
};

const row = ({ browserName, ...rest }: Row): ToolcraftComponentAcceptance =>
  ({ ...rest, automated: true, browser: controlBrowser(browserName), kind: "control" }) as ToolcraftComponentAcceptance;

const slider = (
  id: keyof typeof wallTargets,
  label: string,
  expectedObservable: string,
): ToolcraftComponentAcceptance =>
  row({
    automatedTestName: `declares the wall ${label.toLowerCase()} slider`,
    browserName: `browser: wall ${label.toLowerCase()} changes the wall`,
    componentType: "slider",
    evidence: "timeline-output",
    expectedObservable,
    fixture,
    id: wallTargets[id],
    target: wallTargets[id],
    timelineCoverage: "keyframes",
    userAction: `Change ${label} and play the loop.`,
  });

export const wallAcceptance: readonly ToolcraftComponentAcceptance[] = [
  row({
    automatedTestName: "declares the word wall switch",
    browserName: "browser: the word wall fills the screen and bursts",
    componentType: "switch",
    evidence: "timeline-output",
    expectedObservable:
      "Turning Show word wall on shows one boxed word at the centre, then copies landing whole at random until the screen is full, then a burst; it reveals its settings and the loop follows its Duration. Off removes it.",
    fixture: "terminal look at default settings",
    id: wallTargets.enabled,
    target: wallTargets.enabled,
    userAction: "Turn Show word wall on and play the loop, then turn it off.",
  }),
  row({
    automatedTestName: "declares the wall word text",
    browserName: "browser: the word changes every copy",
    componentType: "text",
    evidence: "product-output",
    expectedObservable: "Typing a new Word changes every copy on the wall and the boxed centre word.",
    fixture,
    id: wallTargets.text,
    target: wallTargets.text,
    userAction: "Type a new word into Word.",
  }),
  row({
    automatedTestName: "declares the wall typography block",
    browserName: "browser: every typography part restyles the wall",
    componentType: "fontPicker",
    controlPartCoverage: "all-visible-parts",
    evidence: "product-output",
    expectedObservable:
      "Font, weight, size, case, colour, opacity, letter spacing and line height each restyle every word; size and spacing change how many fit.",
    fixture,
    id: wallTargets.type,
    target: wallTargets.type,
    userAction: "Change font, weight, size, case, colour and opacity, letter spacing and line height.",
  }),
  row({
    automatedTestName: "declares the wall start selector",
    browserName: "browser: starts chooses when the wall begins",
    componentType: "segmented",
    evidence: "timeline-output",
    expectedObservable: "After starts the wall once the code roll, end text and logo finish; At start begins at the top of the loop.",
    fixture,
    id: wallTargets.timing,
    optionCoverage: ["after", "start"],
    target: wallTargets.timing,
    userAction: "Select each option of the Starts segmented control and play the loop.",
  }),
  row({
    automatedTestName: "declares the wall arrival selector",
    browserName: "browser: arrival changes how words land",
    componentType: "segmented",
    evidence: "timeline-output",
    expectedObservable: "Flash lands each word boxed then snaps it plain, Pop springs it in, Glitch tears it in with stutters, Plain just appears.",
    fixture,
    id: wallTargets.entry,
    optionCoverage: ["flash", "pop", "glitch", "plain"],
    target: wallTargets.entry,
    userAction: "Select each option of the Arrival segmented control and play the fill.",
  }),
  slider("duration", "Duration", "Raising Duration slows every phase together and lengthens the loop to match."),
  slider("hero", "Hero time", "Raising Hero time keeps the boxed centre word alone for longer before the others land."),
  slider("land", "Land time", "Raising Land time spreads the words' landing over longer; lowering it fills the screen almost at once."),
  slider("hold", "Hold time", "Raising Hold time keeps the full wall up longer before it bursts; 0 bursts as soon as it is full."),
  slider("burst", "Burst time", "Raising Burst time slows the explosion so the words drift out for longer."),
  slider("force", "Force", "Raising Force throws the words further out of the frame."),
  slider("spin", "Spin", "Raising Spin makes the words tumble more as they fly; 0 keeps them upright."),
  slider("colGap", "Column gap", "Raising Column gap spaces the words in a row further apart, so fewer fit across."),
  slider("rowGap", "Row gap", "Raising Row gap spaces the rows further apart, so fewer fit down."),
  row({
    automatedTestName: "declares the wall clear sheet switch",
    browserName: "browser: clear sheet hides the halftone behind the wall",
    componentType: "switch",
    evidence: "timeline-output",
    expectedObservable: "With Clear sheet on only the words show while the wall plays; off draws them over the halftone.",
    fixture,
    id: wallTargets.cover,
    target: wallTargets.cover,
    userAction: "Turn Clear sheet off, then on, and play the loop.",
  }),
  row({
    automatedTestName: "declares the wall sheet blast switch",
    browserName: "browser: sheet blast fires the burst explosion",
    componentType: "switch",
    evidence: "timeline-output",
    expectedObservable: "With Sheet blast on the Burst explosion fires and the sheet returns as the wall blows apart; off leaves only the flying words.",
    fixture,
    id: wallTargets.blast,
    target: wallTargets.blast,
    userAction: "Turn Sheet blast off, then on, and play past the hold.",
  }),
];
