import s from "../zones/zones.module.css";

/** Recent remote audio levels reported by the SDK, oldest to newest. */
export function AudioWaveform({ samples, active }: { samples: number[]; active: boolean }) {
  const speaking = active && samples.slice(-3).some(level => level > 0.025);
  return <div className={s.audioMeter} data-active={active} role="img" aria-label={!active ? "Voice audio inactive" : speaking ? "Voice guide audio playing" : "Voice guide is quiet"}>
    <div className={s.waveform} aria-hidden="true">{samples.map((level, i) => <span key={i} style={{ height: `${3 + (active ? Math.min(1, Math.max(0, level)) : 0) * 29}px` }} />)}</div>
    <span>{!active ? "Audio off" : speaking ? "Guide speaking" : "Listening"}</span>
  </div>;
}
