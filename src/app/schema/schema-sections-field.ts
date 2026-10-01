/** The idle field: quiet marks in the empty cells around the subject. */

import type { ToolcraftControlSectionSchema } from "@/toolcraft/runtime";

import { FIELD_PARTICLE_OPTIONS } from "../engine/engine-particles";
import { whenField, whenFieldMoving } from "./schema-conditions";

export const fieldSection: ToolcraftControlSectionSchema = {
  controls: {
    enabled: {
      applicability: { mode: "always" },
      defaultValue: false,
      description:
        "Fills empty cells with a quiet field of dots, dashes and arrows, or small dots for shape units, held clear of the subject. It can stay still or move.",
      label: "Idle field",
      performanceReason:
        "Field marks fill at most the empty cells of the same grid.",
      performanceRole: "responsiveness",
      target: "field.enabled",
      type: "switch",
    },
    particle: {
      applicability: whenField,
      defaultValue: "match",
      description:
        "What the field is made of. Match marks follows the unit shape; the rest draw dots, rings, bars, dashes, plus signs, a crosshair lattice framed by corner brackets, boxed squares, solid blocks, or a mix.",
      label: "Particle",
      options: FIELD_PARTICLE_OPTIONS,
      performanceReason: "Particle changes the mark each field cell draws, not how many cells draw.",
      performanceRole: "responsiveness",
      target: "field.particle",
      type: "select",
    },
    size: {
      applicability: whenField,
      defaultValue: 100,
      description: "Particle size against its natural size in the cell.",
      label: "Particle size",
      max: 250,
      min: 25,
      performanceReason: "Size scales the same field marks.",
      performanceRole: "responsiveness",
      sliderValueKind: "continuous",
      target: "field.size",
      type: "slider",
      unit: "%",
    },
    density: {
      applicability: whenField,
      defaultValue: 80,
      description: "Share of the empty cells that carry a mark.",
      label: "Density",
      max: 100,
      min: 0,
      performanceReason:
        "Field marks fill at most the empty cells of the same grid, so cost stays linear in cell count.",
      performanceRole: "responsiveness",
      sliderValueKind: "continuous",
      target: "field.density",
      type: "slider",
      unit: "%",
    },
    clearance: {
      applicability: whenField,
      defaultValue: 2,
      description:
        "Cells kept empty around the subject, so it lifts off the field.",
      label: "Clearance",
      max: 8,
      min: 0,
      performanceReason:
        "Clearance widens one mask pass that is linear in cell count.",
      performanceRole: "responsiveness",
      sliderValueKind: "discrete",
      step: 1,
      target: "field.clearance",
      type: "slider",
      variant: "discrete",
    },
    motion: {
      applicability: whenField,
      defaultValue: "still",
      description:
        "Shimmer re-picks characters so the field boils; Drift marches it right a cell at a time; Rain drops it in columns; Wave sweeps a band of denser marks through it; Morph flips each cell from dash to dot to boxed square to plus as a front crosses; Twinkle swells cells as a pulse of light crosses the matrix; Patches switches blocks of the field on and off. The clearance around the subject stays put.",
      label: "Motion",
      options: [
        { label: "Still", value: "still" },
        { label: "Shimmer", value: "shimmer" },
        { label: "Drift", value: "drift" },
        { label: "Rain", value: "rain" },
        { label: "Wave", value: "wave" },
        { label: "Morph", value: "morph" },
        { label: "Twinkle", value: "twinkle" },
        { label: "Patches", value: "patches" },
      ],
      performanceReason: "Field motion changes which empty cells carry a mark, not how many cells exist.",
      performanceRole: "responsiveness",
      target: "field.motion",
      type: "select",
    },
    speed: {
      applicability: whenFieldMoving,
      defaultValue: 20,
      description:
        "How fast the field moves, in real time; low values barely stir it. The loop still closes without a jump.",
      label: "Speed",
      max: 100,
      min: 1,
      performanceReason: "Speed changes how fast the same marks move.",
      performanceRole: "responsiveness",
      sliderValueKind: "continuous",
      target: "field.speed",
      type: "slider",
      unit: "%",
    },
    opacity: {
      applicability: whenField,
      defaultValue: 70,
      label: "Opacity",
      max: 100,
      min: 0,
      performanceReason:
        "Opacity sets one alpha for the field pass.",
      performanceRole: "responsiveness",
      sliderValueKind: "continuous",
      target: "field.opacity",
      type: "slider",
      unit: "%",
    },
  },
  id: "field",
  title: "Field",
};
