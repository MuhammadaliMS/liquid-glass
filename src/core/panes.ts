/** Constrain a value to an inclusive range. */
export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

/** Integrate a damped spring in small fixed steps so it behaves the same at any frame rate. */
export function stepSpring(value: number, velocity: number, target: number, deltaSeconds: number, stiffness = 420, damping = 18): [number, number] {
  const duration = clamp(Number.isFinite(deltaSeconds) ? deltaSeconds : 0, 0, 1 / 15);
  const steps = Math.max(1, Math.ceil(duration / (1 / 240)));
  const dt = duration / steps;
  let position = value;
  let speed = velocity;
  for (let index = 0; index < steps; index += 1) {
    speed += ((target - position) * stiffness - speed * damping) * dt;
    position += speed * dt;
  }
  return [position, speed];
}

/**
 * Turn a computed border-radius ("24px", "50%", "9999px", "12px 30px") into one corner radius
 * in px for a box of the given size, capped so it can never exceed a full pill.
 */
export function parseRadius(value: string, width: number, height: number): number {
  const first = (value || '').trim().split(/\s+/)[0] ?? '';
  const amount = parseFloat(first);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  const shortest = Math.min(width, height);
  const radius = first.endsWith('%') ? amount / 100 * shortest : amount;
  return clamp(radius, 0, shortest / 2);
}

/** Read a unitless number from a CSS custom property, falling back when it's missing or invalid. */
export function readNumber(value: string, fallback: number, minimum = -Infinity, maximum = Infinity): number {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? clamp(parsed, minimum, maximum) : fallback;
}

/** Parse the rgb()/rgba() string a browser returns for a computed colour into 0..1 channels. */
export function parseComputedColor(value: string): [number, number, number, number] | null {
  const match = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)/.exec(value || '');
  if (!match) return null;
  const alphaText = match[4];
  const alpha = alphaText === undefined ? 1 : alphaText.endsWith('%') ? parseFloat(alphaText) / 100 : parseFloat(alphaText);
  return [Number(match[1]) / 255, Number(match[2]) / 255, Number(match[3]) / 255, clamp(alpha, 0, 1)];
}

/** Whether a backdrop URL points at a video the browser can loop. */
export function isVideo(url: string): boolean {
  return /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(url);
}
