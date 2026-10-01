/** Acceptance rows for the Image form layer. */

import type { ToolcraftComponentAcceptance } from "../acceptance/types";
import { formTargets } from "../engine/engine-form";
import { controlBrowser, outputBrowser } from "./acceptance-browser";

const fixture = "terminal look with Image form on and a picture uploaded";

type Row = Omit<ToolcraftComponentAcceptance, "automated" | "browser" | "kind"> & {
  browserName: string;
};

const row = ({ browserName, ...rest }: Row): ToolcraftComponentAcceptance =>
  ({ ...rest, automated: true, browser: controlBrowser(browserName), kind: "control" }) as ToolcraftComponentAcceptance;

const slider = (
  id: keyof typeof formTargets,
  label: string,
  expectedObservable: string,
): ToolcraftComponentAcceptance =>
  row({
    automatedTestName: `declares the form ${label.toLowerCase()} slider`,
    browserName: `browser: form ${label.toLowerCase()} changes the image`,
    componentType: "slider",
    evidence: "timeline-output",
    expectedObservable,
    fixture,
    id: formTargets[id],
    target: formTargets[id],
    timelineCoverage: "keyframes",
    userAction: `Change ${label} and play the loop.`,
  });

const toggle = (
  id: keyof typeof formTargets,
  label: string,
  expectedObservable: string,
): ToolcraftComponentAcceptance =>
  row({
    automatedTestName: `declares the form ${label.toLowerCase()} switch`,
    browserName: `browser: form ${label.toLowerCase()} switch`,
    componentType: "switch",
    evidence: "timeline-output",
    expectedObservable,
    fixture,
    id: formTargets[id],
    target: formTargets[id],
    userAction: `Turn ${label} on, then off, and play the loop.`,
  });

export const formAcceptance: readonly ToolcraftComponentAcceptance[] = [
  row({
    automatedTestName: "declares the image form switch",
    browserName: "browser: the image forms out of flickering glyphs",
    componentType: "switch",
    evidence: "timeline-output",
    expectedObservable:
      "Turning Form image on reveals its settings; with a picture uploaded, glyphs flicker on and lock into the image, which holds to the loop end. Off removes it.",
    fixture: "terminal look at default settings",
    id: formTargets.enabled,
    target: formTargets.enabled,
    userAction: "Turn Form image on, upload a picture and play the loop, then turn it off.",
  }),
  {
    automated: true,
    automatedTestName: "declares the form picture uploader",
    browser: outputBrowser("browser: an uploaded picture forms out of glyphs"),
    componentType: "fileDrop",
    evidence: "media-lifecycle",
    expectedObservable:
      "An uploaded PNG, JPG, WebP or SVG picture forms out of flickering glyphs into its one-ink ASCII likeness; removing it removes the layer's picture.",
    fixture: "terminal look with Image form on",
    id: formTargets.file,
    kind: "control",
    mediaLifecycleCoverage: ["upload", "remove", "reset"],
    target: formTargets.file,
    userAction: "Upload a picture, play the loop, then remove it.",
  },
  row({
    automatedTestName: "declares the form order selector",
    browserName: "browser: order changes which cells lock first",
    componentType: "segmented",
    evidence: "timeline-output",
    expectedObservable: "Random locks cells at random, Centre ripples out from the middle, Top down sweeps downward, Bright locks the brightest first.",
    fixture,
    id: formTargets.order,
    optionCoverage: ["random", "centre", "top", "bright"],
    target: formTargets.order,
    userAction: "Select each option of the Order segmented control and play the loop.",
  }),
  row({
    automatedTestName: "declares the form start selector",
    browserName: "browser: starts chooses when the image forms",
    componentType: "segmented",
    evidence: "timeline-output",
    expectedObservable: "At start forms the image from the top of the loop; After waits for the code roll, end text and logo.",
    fixture,
    id: formTargets.timing,
    optionCoverage: ["start", "after"],
    target: formTargets.timing,
    userAction: "Select each option of the Starts segmented control and play the loop.",
  }),
  slider("duration", "Form time", "Raising Form time makes the cells flicker longer before the whole image has locked."),
  slider("hold", "Hold time", "Raising Hold time keeps the formed image up longer and lengthens the loop to match."),
  slider("cell", "Glyph size", "Lowering Glyph size uses smaller, more numerous characters, so the image shows more detail."),
  slider("size", "Size", "Raising Size makes the formed image fill more of the frame."),
  row({
    automatedTestName: "declares the form ink colour",
    browserName: "browser: ink recolours the formed image",
    componentType: "color",
    evidence: "product-output",
    expectedObservable: "Changing Ink recolours every glyph of the image.",
    fixture,
    id: formTargets.ink,
    target: formTargets.ink,
    timelineCoverage: "keyframes",
    userAction: "Change Ink.",
  }),
  toggle("invert", "Invert", "With Invert on the image forms from its dark parts instead of its light ones."),
  toggle("cover", "Clear sheet", "With Clear sheet on only the forming image shows; off draws it over the halftone."),
];
