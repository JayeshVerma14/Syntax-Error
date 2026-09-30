"use client";

/**
 * Plays the song under the preview in step with the timeline: play and pause
 * follow the transport, a scrub or the loop point re-cues it, and it stays
 * silent while the timeline is paused. Returns the song position actually
 * being heard, or null while silent, so the preview can react to the sound
 * itself rather than to a clock it may have drifted from.
 */

import * as React from "react";

import { createSongPlayer, type Song } from "./engine-audio-io";

export function useAudioPlayback(
  song: Song | null,
  playing: boolean,
  songSeconds: number,
  volume: number,
): () => number | null {
  const player = React.useRef<ReturnType<typeof createSongPlayer> | null>(null);

  React.useEffect(() => {
    if (!song && !player.current) return;
    player.current ??= createSongPlayer();
    player.current.cue({ playing, seconds: songSeconds, song, volume });
  }, [playing, song, songSeconds, volume]);

  React.useEffect(
    () => () => {
      player.current?.dispose();
      player.current = null;
    },
    [],
  );

  return React.useCallback(() => player.current?.heardSeconds() ?? null, []);
}
