"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const TRACKS = [
  { title: "Khaleja BGM", src: "/bgm/Khaleja_BGM.mp3" },
  { title: "Interstellar · Imperial Orchestra", src: "/bgm/Interstellar_%20Imperial_Orchestra.mp3" },
];

export default function JourneyMusic() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [trackIndex, setTrackIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(0.28);

  const play = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    try { await audio.play(); setPlaying(true); } catch { setPlaying(false); }
  }, []);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) void play();
    else { audio.pause(); setPlaying(false); }
  }, [play]);

  const changeTrack = useCallback((direction: 1 | -1) => {
    setTrackIndex((current) => (current + direction + TRACKS.length) % TRACKS.length);
    setPlaying(false);
  }, []);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.load();
    void play();
  }, [play, trackIndex]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onEnded = () => setTrackIndex((current) => (current + 1) % TRACKS.length);
    audio.addEventListener("ended", onEnded);

    const resumeOnInteraction = (event: Event) => {
      if (event.target instanceof Element && event.target.closest(".jrnMusic")) return;
      void play();
      window.removeEventListener("pointerdown", resumeOnInteraction);
      window.removeEventListener("keydown", resumeOnInteraction);
      window.removeEventListener("touchstart", resumeOnInteraction);
    };
    window.addEventListener("pointerdown", resumeOnInteraction, { once: true });
    window.addEventListener("keydown", resumeOnInteraction, { once: true });
    window.addEventListener("touchstart", resumeOnInteraction, { once: true });
    return () => {
      audio.removeEventListener("ended", onEnded);
      window.removeEventListener("pointerdown", resumeOnInteraction);
      window.removeEventListener("keydown", resumeOnInteraction);
      window.removeEventListener("touchstart", resumeOnInteraction);
    };
  }, [play]);

  return (
    <div className="jrnMusic" aria-label="Portfolio soundtrack">
      <audio ref={audioRef} src={TRACKS[trackIndex].src} preload="auto" />
      <button className="jrnMusicToggle" type="button" onClick={toggle} aria-label={playing ? "Pause soundtrack" : "Play soundtrack"}>
        <span aria-hidden="true">{playing ? "Ⅱ" : "▶"}</span>
        <b>{playing ? "Soundtrack on" : "Play soundtrack"}</b>
      </button>
      <button className="jrnMusicStep" type="button" onClick={() => changeTrack(-1)} aria-label="Previous track">‹</button>
      <span className="jrnMusicTrack" title={TRACKS[trackIndex].title} aria-live="polite">Now playing · {TRACKS[trackIndex].title}</span>
      <button className="jrnMusicStep" type="button" onClick={() => changeTrack(1)} aria-label="Next track">›</button>
      <label className="jrnMusicVolume" title="Soundtrack volume">
        <span aria-hidden="true">◖</span>
        <input type="range" min="0" max="1" step="0.01" value={volume} onChange={(event) => setVolume(Number(event.target.value))} aria-label="Soundtrack volume" />
      </label>
    </div>
  );
}
