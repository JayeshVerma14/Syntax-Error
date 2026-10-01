import { describe, expect, it } from "vitest";

import {
  analyzeAudio,
  readAudio,
  sampleAudio,
  segmentFileSuffix,
  SILENT_AUDIO,
  songSecondsAt,
} from "./engine-audio";
import { reactToAudio } from "./engine-audio-react";
import { readEngineSettings } from "./engine-settings";

const RATE = 22_050;

/** Eight seconds of 120 BPM: a decaying 55 Hz kick every half second over faint hiss. */
function kickTrack(): Float32Array {
  const samples = new Float32Array(RATE * 8);
  let seed = 7;
  for (let index = 0; index < samples.length; index += 1) {
    seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
    const hiss = ((seed / 2_147_483_648) * 2 - 1) * 0.02;
    const sinceKick = (index / RATE) % 0.5;
    const kick = Math.sin(2 * Math.PI * 55 * sinceKick) * Math.exp(-sinceKick * 18) * 0.9;
    samples[index] = kick + hiss;
  }
  return samples;
}

describe("audio analysis", () => {
  const analysis = analyzeAudio(kickTrack(), RATE);

  it("finds the kicks, half a second apart", () => {
    expect(analysis.beatTimes.length).toBeGreaterThanOrEqual(12);
    expect(analysis.beatTimes.length).toBeLessThanOrEqual(17);
    for (const time of analysis.beatTimes) {
      const offBeat = Math.abs(time - Math.round(time / 0.5) * 0.5);
      expect(offBeat).toBeLessThan(0.06);
    }
  });

  it("swells the beat envelope just after a kick and lets it fall before the next", () => {
    const onBeat = sampleAudio(analysis, 4.03, 100).beat;
    const between = sampleAudio(analysis, 4.4, 100).beat;
    expect(onBeat).toBeGreaterThan(0.4);
    expect(between).toBeLessThan(onBeat * 0.5);
  });

  it("puts the kick in the bass band, not the highs", () => {
    const frame = sampleAudio(analysis, 4.03, 100);
    expect(frame.bass).toBeGreaterThan(frame.high);
  });

  it("reports recent beats with their age, newest last", () => {
    const { recentBeats } = sampleAudio(analysis, 5.2, 100);
    expect(recentBeats.length).toBeGreaterThan(0);
    const newest = recentBeats[recentBeats.length - 1];
    expect(newest.ageSeconds).toBeGreaterThanOrEqual(0);
    expect(newest.ageSeconds).toBeLessThan(0.5);
  });

  it("reads silence outside the song", () => {
    const after = sampleAudio(analysis, 30, 100);
    expect(after.bass).toBe(0);
    expect(after.beat).toBe(0);
  });

  it("scales every reading with Sensitivity", () => {
    const quiet = sampleAudio(analysis, 4.03, 50);
    const loud = sampleAudio(analysis, 4.03, 100);
    expect(quiet.bass).toBeLessThan(loud.bass);
  });
});

describe("song segments", () => {
  it("maps timeline time onto the song from Song start", () => {
    const audio = readAudio({ "audio.start": 32.5 });
    expect(songSecondsAt(audio, 0)).toBeCloseTo(32.5);
    expect(songSecondsAt(audio, 4)).toBeCloseTo(36.5);
  });

  it("names an export after its segment", () => {
    expect(segmentFileSuffix(readAudio({ "audio.start": 92.25 }), 8)).toBe("-song-1m32.3s-8s");
  });
});

describe("audio reactions", () => {
  const onBeat = {
    ...SILENT_AUDIO,
    bass: 0.8,
    beat: 1,
    recentBeats: [{ ageSeconds: 0.1, index: 3, strength: 0.9 }],
  };

  it("leaves the picture alone while Audio reactive is off", () => {
    const settings = readEngineSettings({});
    const reaction = reactToAudio(settings, onBeat);
    expect(reaction.pump).toBe(1);
    expect(reaction.textScale).toBe(1);
    expect(reaction.burstEvents).toBeUndefined();
  });

  it("keeps every layer still in silence", () => {
    const settings = readEngineSettings({ "audio.enabled": true, "audio.flashOnBeat": true, "audio.shakeOnBeat": true, "audio.zoom": 100 });
    const reaction = reactToAudio(settings, SILENT_AUDIO);
    expect(reaction.hit).toEqual({ flash: 0, shakeX: 0, shakeY: 0, zoom: 1 });
    expect(reaction.knockout).toBe(settings.knockout);
    expect(reaction.pulse.beat).toBe(0);
    expect(reaction.pulse.beatIndex).toBe(-1);
  });

  it("punches, shakes and flashes the picture on a hard beat", () => {
    const settings = readEngineSettings({ "audio.enabled": true, "audio.flashOnBeat": true, "audio.shakeOnBeat": true, "audio.zoom": 100 });
    const reaction = reactToAudio(settings, { ...onBeat, recentBeats: [{ ageSeconds: 0.02, index: 3, strength: 0.9 }] });
    expect(reaction.hit.zoom).toBeGreaterThan(1);
    expect(Math.abs(reaction.hit.shakeX) + Math.abs(reaction.hit.shakeY)).toBeGreaterThan(0);
    expect(reaction.hit.flash).toBeGreaterThan(0);
    expect(reaction.knockout).toBeGreaterThan(settings.knockout);
    expect(reaction.pulse.beatIndex).toBe(3);
    // Without the switches a beat only punches.
    const plain = reactToAudio(readEngineSettings({ "audio.enabled": true, "audio.zoom": 100 }), onBeat);
    expect(plain.hit.flash).toBe(0);
    expect(plain.hit.shakeX).toBe(0);
  });

  it("swells on a beat and fires a burst when asked", () => {
    const settings = readEngineSettings({ "audio.burstOnBeat": true, "audio.enabled": true });
    const reaction = reactToAudio(settings, onBeat);
    expect(reaction.pump).toBeGreaterThan(1);
    expect(reaction.textScale).toBeGreaterThan(1);
    expect(reaction.burstEvents).toEqual([{ age: expect.any(Number), seed: 3 }]);
  });

  it("tears only on beats when Glitch on beats is on", () => {
    const settings = readEngineSettings({ "audio.enabled": true, "audio.glitchOnBeat": true });
    expect(reactToAudio(settings, onBeat).glitch.enabled).toBe(true);
    expect(reactToAudio(settings, SILENT_AUDIO).glitch.enabled).toBe(false);
  });
});
