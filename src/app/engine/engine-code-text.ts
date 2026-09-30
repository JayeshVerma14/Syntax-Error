/**
 * Defaults for the code roll: the sample terminal text a fresh workspace
 * shows, and the phase timings. Kept apart from the renderer so the schema can
 * read them without pulling in drawing code.
 *
 * A tab splits a line: whatever follows it is set flush against the right
 * edge, the way a boot log lines up its status tags.
 */

export const DEFAULT_CODE_TEXT = [
  "/*",
  "Syntax Error is starting…",
  "",
  "    ...scanning the source",
  "    A new frame has been detected",
  "    : the grid needs rebuilding.",
  "",
  "a render is in progress...",
  "",
  "Ready >>",
  "Set sample mode to: GRID",
  "{ Initializing unit ramp }",
  "    *** Too many pixels ***",
  "    _ Reducing to cells _",
  "The canvas is big : setting type ACROSS THE WHOLE SHEET.",
  "    >> Legible?",
  "Sure.",
  "    // Set mode: MORE CONTRAST.",
  "Tone pass complete, quantizing EVERY INK.",
  "",
  ">>",
  "",
  "Halftone engine updating...",
  "LOG(DEBUG): Executing <<",
  "",
  '#include "grid.h"',
  "int main(int argc, char* argv[]){",
  '    printf("Syntax Error 0.1");',
  "    // Build the tone field",
  "    if (!BuildGrid()){",
  '        fprintf(stderr, "Error sampling source.");',
  "        return 1;",
  "    }",
  "    // Start the render loop",
  "    CellSize = 24;",
  "    CreateThread(RenderSheet, NULL);",
  "    while (1) { Present(); }",
  "    return 0;",
  "}",
  "",
  ">>",
  "Initializing render pipeline...",
  "Activating:",
  "Decoding the source into summed-area tables\t[ OK ]",
  "Averaging cells at the current pitch\t[ OK ]",
  "Applying contrast and lightness\t[ OK ]",
  "Running the blue-noise dither\t[ RUN ]",
  "Matching every cell to the nearest ink\t[ OK ]",
  "Diffusing colour error across neighbours\t[ OK ]",
  "Choosing a mark for each tone step\t[ OK ]",
  "Setting glyphs on the type grid\t[ OK ]",
  "Boxing the brightest cells\t[ RUN ]",
  "Clearing a margin around the subject\t[ OK ]",
  "Projecting the sheet through the camera\t[ OK ]",
  "Slicing glitch blocks\t[ OK ]",
  "Seeding the burst\t[ OK ]",
  "Orbiting the swirl streams\t[ OK ]",
  "Typing the caption\t[ OK ]",
  "Encoding frames for export\t[ RUN ]",
  "Verifying the loop seam\t[ OK ]",
  "Render complete successfully!\t[ OK ]",
].join("\n");

/*
 * The phases run back to back: the text rolls in, holds for the pause, breaks
 * apart, then the end text holds. Their sum is the length of the sequence.
 */

/** Seconds for the whole text to arrive. */
export const DEFAULT_CODE_ROLL_SECONDS = 3;
/** Seconds the arrived text holds still before it breaks. */
export const DEFAULT_CODE_PAUSE_SECONDS = 0.4;
/** Seconds the break takes until the last character has gone. */
export const DEFAULT_CODE_BREAK_SECONDS = 1.6;
/** Seconds the end text stays up, including its reveal and its exit. */
export const DEFAULT_END_HOLD_SECONDS = 3;

export const DEFAULT_END_TEXT = "System > Updated";

/** Upper bound for the roll and end text sliders, in seconds. */
export const MAX_CODE_PHASE_SECONDS = 20;
/** Upper bound for the pause and break sliders, in seconds. */
export const MAX_CODE_SHORT_PHASE_SECONDS = 10;
