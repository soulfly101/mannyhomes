import { useRef, useState, type PointerEvent } from "react";

const WIDTH = 600;
const HEIGHT = 180;

/** Draw a signature with a finger or mouse. Reports a PNG data URL, or null when empty. */
export function SignaturePad({ onChange, label = "Draw your signature" }: { onChange: (image: string | null) => void; label?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  const point = (e: PointerEvent<HTMLCanvasElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - box.left) / (box.width || WIDTH)) * WIDTH, y: ((e.clientY - box.top) / (box.height || HEIGHT)) * HEIGHT };
  };

  const start = (e: PointerEvent<HTMLCanvasElement>) => {
    const ctx = e.currentTarget.getContext("2d");
    if (!ctx) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drawing.current = true;
    const { x, y } = point(e);
    // Always dark ink: the document it's stamped on is white, in light and dark mode.
    ctx.strokeStyle = "#2a211b";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const move = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = e.currentTarget.getContext("2d");
    if (!ctx) return;
    const { x, y } = point(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasInk(true);
  };

  const end = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    drawing.current = false;
    if (hasInk) onChange(e.currentTarget.toDataURL("image/png"));
  };

  const clear = () => {
    canvas.current?.getContext("2d")?.clearRect(0, 0, WIDTH, HEIGHT);
    setHasInk(false);
    onChange(null);
  };

  return (
    <div>
      <canvas
        ref={canvas}
        width={WIDTH}
        height={HEIGHT}
        role="img"
        aria-label={label}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        className="h-44 w-full cursor-crosshair touch-none rounded-xl border-2 border-dashed border-input bg-white"
      />
      <div className="mt-2 flex items-center justify-between gap-3 text-sm text-muted-foreground">
        <span>{hasInk ? "Not happy with it? Clear it and try again." : "Sign in the box with your finger or mouse."}</span>
        <button type="button" onClick={clear} disabled={!hasInk} className="min-h-11 font-semibold text-primary disabled:opacity-50">
          Clear
        </button>
      </div>
    </div>
  );
}
