/** Image form: an uploaded image assembles out of flickering glyphs. */

import type { ToolcraftControlSectionSchema } from "@/toolcraft/runtime";

import { whenForm } from "./schema-conditions";

const formCost =
  "The image is sampled once per upload, size and cell; each frame draws one character per covered cell.";

const slider = (
  label: string,
  target: string,
  defaultValue: number,
  min: number,
  max: number,
  step: number,
  unit: string,
  description: string,
) => ({
  applicability: whenForm,
  defaultValue,
  description,
  label,
  max,
  min,
  performanceReason: formCost,
  performanceRole: "responsiveness" as const,
  sliderValueKind: "continuous" as const,
  step,
  target,
  type: "slider" as const,
  unit,
});

export const formSection: ToolcraftControlSectionSchema = {
  controls: {
    enabled: {
      applicability: { mode: "always" },
      defaultValue: false,
      description:
        "Your image assembles out of glyphs: each cell flickers through random characters, then locks onto the character its tone calls for, until the whole picture stands in one ink. It holds to the end of the loop.",
      label: "Form image",
      performanceReason: formCost,
      performanceRole: "responsiveness",
      target: "form.enabled",
      type: "switch",
    },
    file: {
      accept: ".png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml",
      applicability: whenForm,
      assetKind: "file",
      label: "Picture",
      performanceReason: "The picture is decoded once and sampled once per size.",
      performanceRole: "responsiveness",
      target: "form.file",
      type: "fileDrop",
    },
    order: {
      applicability: whenForm,
      defaultValue: "random",
      description: "Which cells lock first: at random, rippling out from the centre, top to bottom, or brightest first.",
      label: "Order",
      options: [
        { label: "Random", value: "random" },
        { label: "Centre", value: "centre" },
        { label: "Top", value: "top" },
        { label: "Bright", value: "bright" },
      ],
      performanceReason: formCost,
      performanceRole: "responsiveness",
      target: "form.order",
      type: "segmented",
    },
    timing: {
      applicability: whenForm,
      defaultValue: "start",
      description: "At start: from the top of the loop. After: once the code roll, end text and logo finish.",
      label: "Starts",
      options: [
        { label: "At start", value: "start" },
        { label: "After", value: "after" },
      ],
      performanceReason: formCost,
      performanceRole: "responsiveness",
      target: "form.timing",
      type: "segmented",
    },
    duration: slider("Form time", "form.duration", 3, 0.2, 30, 0.1, "s", "Seconds from the first flicker until every cell has locked."),
    hold: slider("Hold time", "form.hold", 2, 0, 30, 0.1, "s", "Seconds the formed image holds; the loop runs at least this long."),
    cell: slider("Glyph size", "form.cell", 12, 4, 64, 1, "px", "Height of one character cell; smaller cells show more detail."),
    size: slider("Size", "form.size", 90, 10, 150, 1, "%", "How much of the frame the image fills."),
    ink: {
      applicability: whenForm,
      defaultValue: "#FFFFFF",
      description: "Colour of every glyph.",
      label: "Ink",
      performanceReason: "Ink changes one colour.",
      performanceRole: "responsiveness",
      target: "form.ink",
      type: "color",
    },
    invert: {
      applicability: whenForm,
      defaultValue: false,
      description: "Forms the image from its dark parts instead of its light ones, for dark art on a light ground.",
      label: "Invert",
      performanceReason: "Invert resamples the picture once.",
      performanceRole: "responsiveness",
      target: "form.invert",
      type: "switch",
    },
    cover: {
      applicability: whenForm,
      defaultValue: true,
      description: "Hides the halftone sheet from the moment the image starts forming.",
      label: "Clear sheet",
      performanceReason: "Clearing the sheet skips its draw.",
      performanceRole: "responsiveness",
      target: "form.cover",
      type: "switch",
    },
  },
  id: "form",
  layoutGroups: [{ columns: 2, controls: ["invert", "cover"], layout: "inline" }],
  title: "Image form",
};
