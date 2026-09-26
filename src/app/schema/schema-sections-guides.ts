/** Editor-only guides drawn over the sheet and kept out of every artifact. */

import type { ToolcraftControlSectionSchema } from "@/toolcraft/runtime";

export const guidesSection: ToolcraftControlSectionSchema = {
  controls: {
    circle: {
      applicability: { mode: "always" },
      defaultValue: false,
      description:
        "A centred circular guide for round stickers and badge lockups.",
      label: "Circle guide",
      performanceReason:
        "Guides are one editor-only stroke and never enter an artifact.",
      performanceRole: "responsiveness",
      target: "view.circleOverlay",
      type: "switch",
    },
    grid: {
      applicability: { mode: "always" },
      defaultValue: false,
      label: "Cell grid",
      performanceReason:
        "Guides are one editor-only stroke and never enter an artifact.",
      performanceRole: "responsiveness",
      target: "view.grid",
      type: "switch",
    },
  },
  id: "guides",
  layoutGroups: [
    { columns: 2, controls: ["grid", "circle"], layout: "inline" },
  ],
  title: "Guides",
};
