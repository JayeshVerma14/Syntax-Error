/**
 * Songs in the browser: decoding an uploaded track, keeping its analysis per
 * media resource, cutting the segment a clip exports with, and a player that
 * follows the timeline in the preview. This is the one module that touches
 * Web Audio; everything else sees a song as an analysis and a sample buffer.
 */

import { analyzeAudio, type AudioAnalysis } from "./engine-audio";

export type Song = Readonly<{ analysis: AudioAnalysis; buffer: AudioBuffer }>;

type SongEntry = {
  pending?: Promise<Song | null>;
  song?: Song | null;
  url: string;
};

const songs = new Map<string, SongEntry>();

/** Decoding resamples every song to one rate, which AAC and Opus both take. */
const SONG_SAMPLE_RATE = 48_000;

async function decodeSong(url: string): Promise<Song | null> {
  try {
    const response = await fetch(url);
    const bytes = await response.arrayBuffer();
    const decoder = new OfflineAudioContext({
      length: 1,
      numberOfChannels: 2,
      sampleRate: SONG_SAMPLE_RATE,
    });
    const buffer = await decoder.decodeAudioData(bytes);
    const mono = new Float32Array(buffer.length);
    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      const data = buffer.getChannelData(channel);
      for (let index = 0; index < data.length; index += 1) {
        mono[index] += data[index] / buffer.numberOfChannels;
      }
    }
    return { analysis: analyzeAudio(mono, buffer.sampleRate), buffer };
  } catch {
    // An unreadable or unsupported file analyses as silence.
    return null;
  }
}

/** Starts decoding the song behind a media resource, once per URL. */
export function loadSong(resourceRef: string, url: string): Promise<Song | null> {
  const existing = songs.get(resourceRef);
  if (existing && existing.url === url) {
    if (existing.song !== undefined) return Promise.resolve(existing.song);
    if (existing.pending) return existing.pending;
  }
  const entry: SongEntry = { url };
  entry.pending = decodeSong(url).then((song) => {
    entry.song = song;
    entry.pending = undefined;
    return song;
  });
  songs.set(resourceRef, entry);
  return entry.pending;
}

export function peekSong(resourceRef: string): Song | null {
  return songs.get(resourceRef)?.song ?? null;
}

export function awaitSong(resourceRef: string): Promise<Song | null> {
  const entry = songs.get(resourceRef);
  if (!entry) return Promise.resolve(null);
  if (entry.song !== undefined) return Promise.resolve(entry.song);
  return entry.pending ?? Promise.resolve(null);
}

export function releaseSongs(active: ReadonlySet<string>): void {
  for (const key of [...songs.keys()]) {
    if (!active.has(key)) songs.delete(key);
  }
}

/**
 * The part of a song one clip exports with: from `startSeconds` for
 * `durationSeconds`, at `volume` (0..1). Past the song's end is silence.
 */
export function sliceSong(
  song: Song,
  startSeconds: number,
  durationSeconds: number,
  volume: number,
): AudioBuffer {
  const source = song.buffer;
  const rate = source.sampleRate;
  const length = Math.max(1, Math.round(durationSeconds * rate));
  const slice = new AudioBuffer({
    length,
    numberOfChannels: source.numberOfChannels,
    sampleRate: rate,
  });
  const from = Math.round(startSeconds * rate);
  for (let channel = 0; channel < source.numberOfChannels; channel += 1) {
    const input = source.getChannelData(channel);
    const output = slice.getChannelData(channel);
    const count = Math.max(0, Math.min(length, input.length - from));
    for (let index = 0; index < count; index += 1) {
      output[index] = input[from + index] * volume;
    }
  }
  return slice;
}

export type SongCue = Readonly<{
  playing: boolean;
  /** Song second the timeline is at. */
  seconds: number;
  song: Song | null;
  /** 0..1. */
  volume: number;
}>;

/**
 * A timeline step this far from the wall clock is a scrub or the loop point,
 * so the song is re-cued there.
 */
const JUMP_SECONDS = 0.3;
/** Drift beyond this is corrected by re-cueing; less is left alone. */
const DRIFT_SECONDS = 0.5;

/**
 * Plays a song in step with the timeline. `cue` is called on every preview
 * frame. Restarting a sound is audible, so the player re-cues only when the
 * timeline jumps (a scrub or the loop point) or drifts far; small drift from
 * a busy machine's audio clock is left alone, and the preview reads the song
 * position actually heard through `heardSeconds`, so what reacts on screen
 * matches what plays.
 */
export function createSongPlayer(): Readonly<{
  cue: (cue: SongCue) => void;
  dispose: () => void;
  heardSeconds: () => number | null;
}> {
  let context: AudioContext | null = null;
  let gain: GainNode | null = null;
  let source: AudioBufferSourceNode | null = null;
  let playingSong: Song | null = null;
  let startedAt = 0;
  let startOffset = 0;
  let lastSeconds = 0;
  let lastWall = 0;

  const stop = () => {
    if (!source) return;
    try {
      source.stop();
    } catch {
      // Already stopped.
    }
    source.disconnect();
    source = null;
    playingSong = null;
  };

  const start = (song: Song, seconds: number) => {
    if (!context || !gain) return;
    stop();
    const node = context.createBufferSource();
    node.buffer = song.buffer;
    node.connect(gain);
    node.start(0, seconds);
    source = node;
    playingSong = song;
    startedAt = context.currentTime;
    startOffset = seconds;
  };

  return {
    cue: ({ playing, seconds, song, volume }) => {
      if (!playing || !song || seconds < 0 || seconds >= song.buffer.duration) {
        stop();
        return;
      }
      if (!context) {
        context = new AudioContext({ latencyHint: "interactive" });
        gain = context.createGain();
        gain.connect(context.destination);
      }
      if (gain) gain.gain.value = volume;
      if (context.state === "suspended") {
        // Browsers hold audio until the page has had a user gesture; the
        // play press is one, so this resumes on the next cue at the latest.
        void context.resume();
      }
      if (context.state !== "running") return;
      const wall = performance.now();
      const stepped = seconds - lastSeconds;
      const elapsed = (wall - lastWall) / 1000;
      lastSeconds = seconds;
      lastWall = wall;
      const heard = startOffset + (context.currentTime - startedAt);
      if (
        !source ||
        playingSong !== song ||
        Math.abs(stepped - elapsed) > JUMP_SECONDS ||
        Math.abs(heard - seconds) > DRIFT_SECONDS
      ) {
        start(song, seconds);
      }
    },
    dispose: () => {
      stop();
      void context?.close();
      context = null;
      gain = null;
    },
    heardSeconds: () =>
      source && context && context.state === "running"
        ? startOffset + (context.currentTime - startedAt)
        : null,
  };
}
