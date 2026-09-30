/** Audio reactivity: a song drives the picture, and rides along in video exports. */

import type { ToolcraftControlSectionSchema } from "@/toolcraft/runtime";

import { MAX_SONG_START_SECONDS } from "../engine/engine-audio";
import { whenAudio } from "./schema-conditions";

export const audioSection: ToolcraftControlSectionSchema = {
  controls: {
    enabled: {
      applicability: { mode: "always" },
      defaultValue: false,
      description:
        "Upload a song and the picture reacts to it: beats swell and fire effects, and bass, mids and highs drive layers. The clip covers the song from Song start for the timeline's length, and video exports carry that part of the song.",
      label: "Audio reactive",
      performanceReason:
        "A song is analysed once; each frame reads a few precomputed values.",
      performanceRole: "responsiveness",
      target: "audio.enabled",
      type: "switch",
    },
    file: {
      accept:
        ".mp3,.wav,.m4a,.aac,.ogg,.flac,audio/mpeg,audio/wav,audio/mp4,audio/aac,audio/ogg,audio/flac",
      applicability: whenAudio,
      assetKind: "file",
      label: "Music",
      performanceReason:
        "The song is decoded and analysed once per upload, not per frame.",
      performanceRole: "responsiveness",
      target: "audio.file",
      type: "fileDrop",
    },
    start: {
      applicability: whenAudio,
      defaultValue: 0,
      description:
        "Where in the song this clip starts, in seconds. The clip lasts the timeline's length, and exported files are named after the segment.",
      label: "Song start",
      max: MAX_SONG_START_SECONDS,
      min: 0,
      performanceReason: "Song start moves which analysed values are read.",
      performanceRole: "responsiveness",
      sliderValueKind: "continuous",
      step: 0.1,
      target: "audio.start",
      type: "slider",
      unit: "s",
    },
    volume: {
      applicability: whenAudio,
      defaultValue: 80,
      description: "Loudness of the song in the preview and in exported video.",
      label: "Volume",
      max: 100,
      min: 0,
      performanceReason: "Volume scales the sound, not the picture.",
      performanceRole: "responsiveness",
      sliderValueKind: "continuous",
      target: "audio.volume",
      type: "slider",
      unit: "%",
    },
    sensitivity: {
      applicability: whenAudio,
      defaultValue: 100,
      description:
        "Gain on the analysed music: raise it for quiet tracks, lower it when everything reacts at once.",
      label: "Sensitivity",
      max: 300,
      min: 25,
      performanceReason: "Sensitivity scales values that are already computed.",
      performanceRole: "responsiveness",
      sliderValueKind: "continuous",
      target: "audio.sensitivity",
      type: "slider",
      unit: "%",
    },
    pulse: {
      applicability: whenAudio,
      defaultValue: 40,
      description:
        "How much each beat swells the units and the code and end text, brightens the idle field and flashes the CRT light band.",
      label: "Beat pulse",
      max: 100,
      min: 0,
      performanceReason: "The pulse scales marks that are drawn anyway.",
      performanceRole: "responsiveness",
      sliderValueKind: "continuous",
      target: "audio.pulse",
      type: "slider",
      unit: "%",
    },
    levels: {
      applicability: whenAudio,
      defaultValue: 40,
      description:
        "How much the music's levels drive the picture: bass swells the units and the swirl, mids thicken the idle field, highs deepen the CRT scanlines.",
      label: "Level drive",
      max: 100,
      min: 0,
      performanceReason: "Level drive scales settings that are drawn anyway.",
      performanceRole: "responsiveness",
      sliderValueKind: "continuous",
      target: "audio.levels",
      type: "slider",
      unit: "%",
    },
    burstOnBeat: {
      applicability: whenAudio,
      defaultValue: false,
      description:
        "Fires the Burst section's explosion on every strong beat, with its origin, rays, reach and speed.",
      label: "Beat burst",
      performanceReason: "A beat burst costs what one loop burst does.",
      performanceRole: "responsiveness",
      target: "audio.burstOnBeat",
      type: "switch",
    },
    glitchOnBeat: {
      applicability: whenAudio,
      defaultValue: false,
      description:
        "Spikes the Glitch section's tearing on each beat, with a fresh tear pattern every time, and holds it clean between beats.",
      label: "Beat glitch",
      performanceReason: "A beat glitch costs what the glitch layer does.",
      performanceRole: "responsiveness",
      target: "audio.glitchOnBeat",
      type: "switch",
    },
  },
  id: "audio",
  layoutGroups: [
    { columns: 2, controls: ["burstOnBeat", "glitchOnBeat"], layout: "inline" },
  ],
  title: "Audio",
};
