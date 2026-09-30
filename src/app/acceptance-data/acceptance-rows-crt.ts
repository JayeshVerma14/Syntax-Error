/** Acceptance rows for the CRT monitor pass. */

import type { ToolcraftComponentAcceptance } from "../acceptance/types";
import { crtTargets } from "../engine/engine-crt";
import { controlBrowser } from "./acceptance-browser";

const crtFixture = "terminal look with the CRT effect on";

export const crtAcceptance: readonly ToolcraftComponentAcceptance[] = [
  {
    automated: true,
    automatedTestName: "declares the CRT switch",
    browser: controlBrowser("browser: the CRT effect lays scanlines and a light band over the frame"),
    componentType: "switch",
    evidence: "timeline-output",
    expectedObservable:
      "Turning CRT effect on lays faint scanlines that crawl down the whole frame and a soft band of light rolling over it, and reveals the CRT settings; off removes them.",
    fixture: "terminal look at default settings",
    id: "crt.enabled",
    kind: "control",
    target: crtTargets.enabled,
    userAction: "Turn CRT effect on and play the loop, then turn it off.",
  },
  {
    automated: true,
    automatedTestName: "declares the CRT strength slider",
    browser: controlBrowser("browser: strength darkens the scanlines"),
    componentType: "slider",
    evidence: "product-output",
    expectedObservable: "Raising Strength darkens the scanlines; 0 leaves only the light band.",
    fixture: crtFixture,
    id: "crt.strength",
    kind: "control",
    target: crtTargets.strength,
    timelineCoverage: "keyframes",
    userAction: "Raise Strength, then lower it to 0.",
  },
  {
    automated: true,
    automatedTestName: "declares the CRT line spacing slider",
    browser: controlBrowser("browser: line spacing sets the scanline pitch"),
    componentType: "slider",
    evidence: "product-output",
    expectedObservable: "Raising Line spacing draws fewer, wider-spaced scanlines.",
    fixture: crtFixture,
    id: "crt.spacing",
    kind: "control",
    target: crtTargets.spacing,
    timelineCoverage: "keyframes",
    userAction: "Raise Line spacing.",
  },
  {
    automated: true,
    automatedTestName: "declares the CRT light band slider",
    browser: controlBrowser("browser: the light band rolls down the frame"),
    componentType: "slider",
    evidence: "timeline-output",
    expectedObservable:
      "Raising Light band brightens the soft bar that rolls down the frame; 0 turns it off.",
    fixture: crtFixture,
    id: "crt.band",
    kind: "control",
    target: crtTargets.band,
    timelineCoverage: "keyframes",
    userAction: "Raise Light band and play the loop.",
  },
  {
    automated: true,
    automatedTestName: "declares the CRT passes slider",
    browser: controlBrowser("browser: passes speeds up the rolling band"),
    componentType: "slider",
    evidence: "timeline-output",
    expectedObservable:
      "Raising Passes rolls the light band down more times per loop, with the scanlines crawling in step.",
    fixture: crtFixture,
    id: "crt.passes",
    kind: "control",
    target: crtTargets.passes,
    timelineCoverage: "keyframes",
    userAction: "Raise Passes and play the loop.",
  },
];
