import { useEffect, useRef } from "react";

export function SpaceBackdrop() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    let frame = 0;
    let width = 0;
    let height = 0;
    const stars = Array.from({ length: 150 }, (_, index) => ({
      seed: index * 0.731,
      x: (index * 83.17) % 1,
      y: (index * 47.29) % 1,
      size: 0.35 + ((index * 13) % 10) / 10,
      alpha: 0.2 + ((index * 7) % 8) / 12,
    }));
    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth; height = canvas.clientHeight;
      canvas.width = width * ratio; canvas.height = height * ratio;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    const draw = (time: number) => {
      context.clearRect(0, 0, width, height);
      const glow = context.createRadialGradient(width * .54, height * .43, 0, width * .54, height * .43, Math.max(width, height) * .52);
      glow.addColorStop(0, "rgba(35, 88, 145, .18)"); glow.addColorStop(1, "rgba(3, 8, 18, 0)");
      context.fillStyle = glow; context.fillRect(0, 0, width, height);
      stars.forEach((star) => {
        const twinkle = .75 + Math.sin(time / 1200 + star.seed) * .25;
        context.globalAlpha = star.alpha * twinkle;
        context.fillStyle = star.seed % 3 === 0 ? "#bfa5ff" : "#9fe8ff";
        context.beginPath(); context.arc(star.x * width, star.y * height, star.size, 0, Math.PI * 2); context.fill();
      });
      context.globalAlpha = 1;
      frame = window.requestAnimationFrame(draw);
    };
    resize(); window.addEventListener("resize", resize); frame = window.requestAnimationFrame(draw);
    return () => { window.removeEventListener("resize", resize); window.cancelAnimationFrame(frame); };
  }, []);
  return <div className="space-backdrop" aria-hidden="true"><canvas ref={canvasRef} /></div>;
}
