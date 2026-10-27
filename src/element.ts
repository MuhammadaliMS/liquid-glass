import { createGlassRenderer, MAX_PANES, type GlassRenderer, type Pane } from './core/renderer';
import { loadImage } from './core/backdrop';
import { clamp, isVideo, parseComputedColor, parseRadius, readNumber, stepSpring } from './core/panes';

const AURORA: [number, number, number][] = [[1, 0.35, 0.12], [1, 0.18, 0.54], [0.42, 0.23, 1], [0, 0.76, 1]];
const AURORA_BASE: [number, number, number] = [0.04, 0.03, 0.12];

const template = document.createElement('template');
template.innerHTML = `<style>
:host { display: block; position: relative; isolation: isolate; overflow: hidden; min-height: 120px; color: #fff; background: #0a0818; }
:host([hidden]) { display: none; }
canvas { position: absolute; inset: 0; width: 100%; height: 100%; z-index: 0; pointer-events: none; opacity: 0; transition: opacity .5s; }
:host([data-ready]) canvas { opacity: 1; }
.fallback { position: absolute; inset: 0; z-index: 0; background: var(--image, linear-gradient(120deg, #ff5a1f, #ff2d8a 35%, #6a3bff 65%, #00c2ff)) center / cover no-repeat; }
:host([data-renderer='webgl'][data-ready]) .fallback { display: none; }
.content { position: relative; z-index: 1; height: 100%; }
</style><div class="fallback" part="fallback"></div><canvas part="canvas" aria-hidden="true"></canvas><div class="content" part="content"><slot></slot></div>`;

// Panels keep their own layout and content; without WebGL they become frosted CSS glass.
const GLOBAL_STYLE = `
liquid-glass [glass] { -webkit-tap-highlight-color: transparent; }
liquid-glass [glass-drag] { touch-action: none; cursor: grab; user-select: none; }
liquid-glass [glass-drag]:active { cursor: grabbing; }
liquid-glass:not([data-renderer='webgl']) [glass] { background: rgba(255,255,255,.16); border: 1px solid rgba(255,255,255,.38); box-shadow: inset 0 1px 1px rgba(255,255,255,.6), 0 10px 30px rgba(0,0,0,.18); backdrop-filter: blur(14px) saturate(1.7); -webkit-backdrop-filter: blur(14px) saturate(1.7); }`;

interface Look { radius: number; bend: number; frost: number; rim: number; tint: [number, number, number, number]; shadow: number; chroma: number; press: number }
interface PaneState {
  scale: number; scaleVelocity: number;
  glow: number; glowVelocity: number;
  stretchX: number; stretchXVelocity: number;
  stretchY: number; stretchYVelocity: number;
  look: Look | null;
  drag: { pointer: number; startX: number; startY: number; baseX: number; baseY: number; lastX: number; lastY: number; lastT: number; vx: number; vy: number } | null;
  offsetX: number; offsetY: number;
}

/**
 * <liquid-glass>: a scene for liquid glass. It draws a backdrop (the animated aurora, an image or a
 * video) and renders every descendant marked with the `glass` attribute as a piece of curved glass
 * at that element's own position, size and border-radius. Your markup and CSS stay in charge of
 * the layout; the glass follows it, every frame.
 */
export class LiquidGlassElement extends HTMLElement {
  static observedAttributes = ['backdrop', 'colors', 'dim'];

  private readonly canvas: HTMLCanvasElement;
  private readonly fallback: HTMLDivElement;
  private renderer: GlassRenderer | null = null;
  private readonly states = new WeakMap<HTMLElement, PaneState>();
  private readonly colorProbe = document.createElement('span');
  private readonly colorCache = new Map<string, [number, number, number, number]>();
  private readonly motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  private events: AbortController | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private visibility: IntersectionObserver | null = null;
  private mutations: MutationObserver | null = null;
  private video: HTMLVideoElement | null = null;
  private animatedScene = true;
  private sceneDirty = true;
  private stylesDirty = true;
  private onScreen = true;
  private frameId = 0;
  private frameCount = 0;
  private lastFrame = 0;
  private time = 0;
  private width = 1;
  private height = 1;
  private lastSignature = '';
  private backdropRequest = 0;
  private readonly pointer = { x: 0, y: 0, inside: false, down: false, target: null as HTMLElement | null };
  private readonly light = { x: 0, y: 0, present: 0, vx: 0, vy: 0, presentVelocity: 0 };

  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    root.append(template.content.cloneNode(true));
    this.canvas = root.querySelector('canvas')!;
    this.fallback = root.querySelector('.fallback')!;
    this.colorProbe.hidden = true;
    root.append(this.colorProbe);
    if (!document.getElementById('liquid-glass-style')) {
      const style = document.createElement('style');
      style.id = 'liquid-glass-style';
      style.textContent = GLOBAL_STYLE;
      document.head.append(style);
    }
  }

  /** 'aurora' (default), or the URL of an image or video to refract. */
  get backdrop(): string { return this.getAttribute('backdrop') || 'aurora'; }
  set backdrop(value: string) { this.setAttribute('backdrop', value); }

  /** The glass elements this scene renders (at most 16). */
  get panes(): HTMLElement[] {
    return Array.from(this.querySelectorAll<HTMLElement>('[glass]')).slice(0, MAX_PANES);
  }

  connectedCallback(): void {
    this.events = new AbortController();
    const signal = this.events.signal;
    try {
      this.renderer = createGlassRenderer(this.canvas);
      this.dataset.renderer = 'webgl';
    } catch (error) {
      console.warn('liquid-glass: WebGL is unavailable, using frosted CSS glass.', error);
      this.dataset.renderer = 'css';
    }
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this);
    this.visibility = new IntersectionObserver(([entry]) => {
      this.onScreen = entry.isIntersecting;
      if (this.onScreen) this.start(); else this.stop();
    });
    this.visibility.observe(this);
    this.mutations = new MutationObserver(() => { this.stylesDirty = true; });
    this.mutations.observe(this, { subtree: true, childList: true, attributes: true });
    this.resize();
    this.applyDim();
    this.applyBackdrop();

    this.addEventListener('pointermove', (event) => this.movePointer(event), { passive: true, signal });
    this.addEventListener('pointerenter', (event) => this.movePointer(event), { passive: true, signal });
    this.addEventListener('pointerleave', () => { this.pointer.inside = false; }, { signal });
    this.addEventListener('pointerdown', (event) => this.press(event), { signal });
    window.addEventListener('pointerup', (event) => this.release(event), { signal });
    window.addEventListener('pointercancel', (event) => this.release(event), { signal });
    window.addEventListener('pointermove', (event) => this.dragMove(event), { passive: true, signal });
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.stop(); else this.start(); }, { signal });
    this.canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      this.renderer?.destroy();
      this.renderer = null;
      this.dataset.renderer = 'css';
    }, { signal });
    this.start();
  }

  disconnectedCallback(): void {
    this.stop();
    this.events?.abort();
    this.resizeObserver?.disconnect();
    this.visibility?.disconnect();
    this.mutations?.disconnect();
    this.video?.pause();
    this.video = null;
    this.renderer?.destroy();
    this.renderer = null;
    delete this.dataset.ready;
  }

  attributeChangedCallback(name: string, previous: string | null, next: string | null): void {
    if (previous === next || !this.isConnected) return;
    if (name === 'backdrop' || name === 'colors') this.applyBackdrop();
    if (name === 'dim') this.applyDim();
  }

  // ---- the backdrop

  private applyBackdrop(): void {
    const request = ++this.backdropRequest;
    const value = this.backdrop.trim();
    this.video?.pause();
    this.video = null;
    if (value === 'aurora' || !value) {
      this.renderer?.setAurora(this.auroraColors(), AURORA_BASE);
      this.renderer?.setSource(null);
      this.fallback.style.removeProperty('--image');
      this.animatedScene = true;
      this.sceneDirty = true;
      this.dataset.ready = '';
      return;
    }
    this.fallback.style.setProperty('--image', `url("${value.replace(/"/g, '%22')}")`);
    this.renderer?.setSource('wait');
    this.sceneDirty = true;
    if (isVideo(value)) {
      const video = document.createElement('video');
      Object.assign(video, { muted: true, loop: true, playsInline: true, autoplay: true, crossOrigin: 'anonymous', src: value });
      video.setAttribute('muted', '');
      this.video = video;
      this.animatedScene = true;
      video.addEventListener('playing', () => { if (request === this.backdropRequest) this.dataset.ready = ''; }, { once: true });
      void video.play().catch(() => undefined);
      return;
    }
    this.animatedScene = false;
    loadImage(value).then((image) => {
      if (request !== this.backdropRequest) return;
      this.renderer?.setSource(image.source, image.width, image.height);
      this.sceneDirty = true;
      this.dataset.ready = '';
    }).catch((error: unknown) => {
      if (request !== this.backdropRequest) return;
      console.warn(`liquid-glass: the backdrop "${value}" could not load (images on other sites need CORS headers). Showing the aurora.`, error);
      this.renderer?.setSource(null);
      this.animatedScene = true;
      this.sceneDirty = true;
      this.dataset.ready = '';
    });
  }

  private applyDim(): void {
    const dim = readNumber(this.getAttribute('dim') ?? '', 0, 0, 0.9);
    this.renderer?.setDim(dim);
    this.fallback.style.filter = dim ? `brightness(${1 - dim})` : '';
    this.sceneDirty = true;
  }

  private auroraColors(): [number, number, number][] {
    const listed = (this.getAttribute('colors') || '').split(/[\s,]+/).filter(Boolean).map((color) => this.resolveColor(color)).filter((color) => color[3] > 0);
    return listed.length ? listed.map(([r, g, b]) => [r, g, b] as [number, number, number]) : AURORA;
  }

  // ---- reading the panes

  private resolveColor(value: string): [number, number, number, number] {
    const cached = this.colorCache.get(value);
    if (cached) return cached;
    this.colorProbe.style.color = '';
    this.colorProbe.style.color = value;
    const parsed = (this.colorProbe.style.color ? parseComputedColor(getComputedStyle(this.colorProbe).color) : null) ?? [0, 0, 0, 0];
    this.colorCache.set(value, parsed);
    return parsed;
  }

  private readLook(element: HTMLElement, width: number, height: number): Look {
    const style = getComputedStyle(element);
    const short = Math.min(width, height);
    const tintText = style.getPropertyValue('--glass-tint').trim();
    return {
      radius: parseRadius(style.borderTopLeftRadius, width, height),
      bend: readNumber(style.getPropertyValue('--glass-bend'), clamp(short * 0.32, 6, 34), 0, 200),
      rim: readNumber(style.getPropertyValue('--glass-rim'), clamp(short * 0.42, 8, 48), 1, 300),
      frost: readNumber(style.getPropertyValue('--glass-frost'), 0.08, 0, 1),
      tint: tintText ? this.resolveColor(tintText) : [1, 1, 1, 0.04],
      shadow: readNumber(style.getPropertyValue('--glass-shadow'), 1, 0, 1),
      chroma: readNumber(style.getPropertyValue('--glass-chroma'), 0.06, 0, 0.3),
      press: readNumber(style.getPropertyValue('--glass-press'), 1.045, 0.8, 1.3),
    };
  }

  private state(element: HTMLElement): PaneState {
    let state = this.states.get(element);
    if (!state) {
      state = { scale: 1, scaleVelocity: 0, glow: 0, glowVelocity: 0, stretchX: 1, stretchXVelocity: 0, stretchY: 1, stretchYVelocity: 0, look: null, drag: null, offsetX: 0, offsetY: 0 };
      this.states.set(element, state);
    }
    return state;
  }

  // ---- pointer: light, press, drag

  private movePointer(event: PointerEvent): void {
    const rect = this.getBoundingClientRect();
    this.pointer.x = event.clientX - rect.left;
    this.pointer.y = event.clientY - rect.top;
    this.pointer.inside = true;
  }

  private press(event: PointerEvent): void {
    this.movePointer(event);
    const pane = (event.target as Element | null)?.closest?.<HTMLElement>('[glass]');
    if (!pane || !this.contains(pane)) return;
    this.pointer.down = true;
    this.pointer.target = pane;
    if (pane.hasAttribute('glass-drag')) {
      const state = this.state(pane);
      state.drag = { pointer: event.pointerId, startX: event.clientX, startY: event.clientY, baseX: state.offsetX, baseY: state.offsetY, lastX: event.clientX, lastY: event.clientY, lastT: event.timeStamp, vx: 0, vy: 0 };
      pane.setPointerCapture?.(event.pointerId);
    }
  }

  private dragMove(event: PointerEvent): void {
    const pane = this.pointer.target;
    const drag = pane ? this.states.get(pane)?.drag : null;
    if (!pane || !drag || drag.pointer !== event.pointerId) return;
    const state = this.state(pane);
    const dt = Math.max(1, event.timeStamp - drag.lastT) / 1000;
    drag.vx = drag.vx * 0.6 + (event.clientX - drag.lastX) / dt * 0.4;
    drag.vy = drag.vy * 0.6 + (event.clientY - drag.lastY) / dt * 0.4;
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    drag.lastT = event.timeStamp;
    state.offsetX = drag.baseX + event.clientX - drag.startX;
    state.offsetY = drag.baseY + event.clientY - drag.startY;
    pane.style.translate = `${state.offsetX}px ${state.offsetY}px`;
  }

  private release(event: PointerEvent): void {
    const pane = this.pointer.target;
    if (pane) {
      const state = this.states.get(pane);
      if (state?.drag && state.drag.pointer === event.pointerId) state.drag = null;
    }
    this.pointer.down = false;
    this.pointer.target = null;
  }

  // ---- the frame loop

  private resize(): void {
    const rect = this.getBoundingClientRect();
    this.width = Math.max(1, rect.width);
    this.height = Math.max(1, rect.height);
    try { this.renderer?.resize(this.width, this.height); }
    catch (error) {
      console.warn(error);
      this.renderer?.destroy();
      this.renderer = null;
      this.dataset.renderer = 'css';
    }
    this.sceneDirty = true;
    this.stylesDirty = true;
    this.lastSignature = '';
  }

  private start(): void {
    if (this.frameId || !this.isConnected || !this.onScreen || document.hidden) return;
    this.lastFrame = performance.now();
    this.frameId = requestAnimationFrame((now) => this.frame(now));
  }

  private stop(): void {
    cancelAnimationFrame(this.frameId);
    this.frameId = 0;
  }

  private frame(now: number): void {
    this.frameId = requestAnimationFrame((next) => this.frame(next));
    const renderer = this.renderer;
    if (!renderer) return;
    const delta = clamp((now - this.lastFrame) / 1000, 0, 1 / 15);
    this.lastFrame = now;
    this.frameCount += 1;
    const still = this.motionQuery.matches || this.hasAttribute('reduce-motion');

    // The backdrop: every frame for the aurora or a video, once for a still image.
    const video = this.video;
    if (video && video.readyState >= 2) { renderer.setSource(video, video.videoWidth, video.videoHeight); this.sceneDirty = true; }
    if (this.animatedScene && !still) { this.time += delta; this.sceneDirty = true; }
    const sceneChanged = this.sceneDirty;
    if (this.sceneDirty) { renderer.drawScene(this.time); this.sceneDirty = false; }

    // The light drifts toward the pointer, and rests above the top-left when it leaves.
    const light = this.light;
    const lightX = this.pointer.inside ? this.pointer.x : this.width * 0.18;
    const lightY = this.pointer.inside ? this.pointer.y : -this.height * 0.25;
    [light.x, light.vx] = stepSpring(light.x, light.vx, lightX, delta, 160, 22);
    [light.y, light.vy] = stepSpring(light.y, light.vy, lightY, delta, 160, 22);
    [light.present, light.presentVelocity] = stepSpring(light.present, light.presentVelocity, this.pointer.inside ? 1 : 0, delta, 90, 18);

    if (this.stylesDirty || this.frameCount % 30 === 0) this.panes.forEach((pane) => { this.state(pane).look = null; });
    this.stylesDirty = false;
    const host = this.getBoundingClientRect();
    const panes: Pane[] = [];
    let moving = Math.abs(light.vx) + Math.abs(light.vy) > 0.5 || Math.abs(light.presentVelocity) > 0.01;
    for (const element of this.panes) {
      const box = element.getBoundingClientRect();
      if (box.width < 1 || box.height < 1 || box.right < host.left || box.left > host.right || box.bottom < host.top || box.top > host.bottom) continue;
      const state = this.state(element);
      state.look ??= this.readLook(element, box.width, box.height);
      const look = state.look;
      const pressed = this.pointer.down && this.pointer.target === element;
      const hovered = this.pointer.inside && this.pointer.x >= box.left - host.left && this.pointer.x <= box.right - host.left && this.pointer.y >= box.top - host.top && this.pointer.y <= box.bottom - host.top;
      const drag = state.drag;
      // Pressing grows the glass a little (it overshoots and settles); dragging stretches it along the motion.
      const targetScale = pressed ? look.press : hovered ? 1 + (look.press - 1) * 0.3 : 1;
      const speedX = drag ? clamp(Math.abs(drag.vx) / 2600, 0, 0.22) : 0;
      const speedY = drag ? clamp(Math.abs(drag.vy) / 2600, 0, 0.22) : 0;
      if (still) {
        Object.assign(state, { scale: targetScale, scaleVelocity: 0, stretchX: 1, stretchY: 1, stretchXVelocity: 0, stretchYVelocity: 0, glow: pressed ? 1 : 0, glowVelocity: 0 });
      } else {
        [state.scale, state.scaleVelocity] = stepSpring(state.scale, state.scaleVelocity, targetScale, delta, 520, 14);
        [state.stretchX, state.stretchXVelocity] = stepSpring(state.stretchX, state.stretchXVelocity, 1 + speedX - speedY * 0.5, delta, 300, 12);
        [state.stretchY, state.stretchYVelocity] = stepSpring(state.stretchY, state.stretchYVelocity, 1 + speedY - speedX * 0.5, delta, 300, 12);
        [state.glow, state.glowVelocity] = stepSpring(state.glow, state.glowVelocity, pressed ? 1 : hovered ? 0.35 : 0, delta, 260, 22);
      }
      if (drag) { drag.vx *= 0.9; drag.vy *= 0.9; }
      moving ||= Math.abs(state.scaleVelocity) + Math.abs(state.stretchXVelocity) + Math.abs(state.stretchYVelocity) + Math.abs(state.glowVelocity) > 0.002;
      panes.push({
        x: box.left - host.left + box.width / 2,
        y: box.top - host.top + box.height / 2,
        halfWidth: box.width / 2 * state.scale * state.stretchX,
        halfHeight: box.height / 2 * state.scale * state.stretchY,
        radius: look.radius * state.scale,
        bend: look.bend, frost: look.frost, rim: look.rim, tint: look.tint,
        glow: state.glow, shadow: look.shadow, chroma: look.chroma,
      });
    }
    const signature = panes.map((pane) => `${pane.x.toFixed(1)},${pane.y.toFixed(1)},${pane.halfWidth.toFixed(1)},${pane.halfHeight.toFixed(1)},${pane.radius},${pane.bend},${pane.frost},${pane.rim},${pane.tint.join(',')}`).join('|');
    if (!sceneChanged && !moving && signature === this.lastSignature) return;
    this.lastSignature = signature;
    renderer.drawGlass(panes, { x: light.x, y: light.y, present: light.present });
  }
}

declare global {
  interface HTMLElementTagNameMap { 'liquid-glass': LiquidGlassElement }
}
