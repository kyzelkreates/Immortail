/**
 * Immortail™ — Waveform visualiser
 * Canvas-drawn waveform from pre-computed Float32Array data.
 */
import { useEffect, useRef } from 'react';

export default function WaveformDisplay({
  waveform,       // Float32Array or Array of 0-1 values
  playing = false,
  progress = 0,   // 0-1 playback progress
  height = 48,
  color = '#C9A84C',
  bgColor = 'rgba(255,255,255,0.05)',
}) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !waveform) return;
    const ctx  = canvas.getContext('2d');
    const W    = canvas.width;
    const H    = canvas.height;
    const len  = waveform.length;
    const barW = Math.max(1, W / len - 1);
    const gap  = 1;

    ctx.clearRect(0, 0, W, H);

    for (let i = 0; i < len; i++) {
      const x       = i * (barW + gap);
      const barH    = Math.max(2, waveform[i] * H * 0.85);
      const y       = (H - barH) / 2;
      const played  = i / len < progress;

      ctx.fillStyle = played
        ? color
        : bgColor;
      ctx.beginPath();
      ctx.roundRect(x, y, barW, barH, 2);
      ctx.fill();
    }
  }, [waveform, progress, color, bgColor]);

  return (
    <canvas
      ref={canvasRef}
      width={280}
      height={height}
      className="w-full rounded"
      style={{ height }}
    />
  );
}
