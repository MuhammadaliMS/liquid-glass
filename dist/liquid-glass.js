var te = Object.defineProperty;
var re = (o, e, t) => e in o ? te(o, e, { enumerable: !0, configurable: !0, writable: !0, value: t }) : o[e] = t;
var c = (o, e, t) => re(o, typeof e != "symbol" ? e + "" : e, t);
const ie = `precision highp float;
// The backdrop the glass bends: an image or video cropped to cover, or the built-in aurora.
uniform vec2 u_size;      // CSS pixels
uniform float u_dpr;
uniform float u_mode;     // 0: image or video, 1: aurora, 2: plain base colour (while an image loads)
uniform sampler2D u_image;
uniform vec4 u_crop;      // scale x, scale y, offset x, offset y (cover crop)
uniform float u_time;
uniform vec3 u_colors[4];
uniform vec3 u_base;
uniform float u_dim;       // 0..1, darkens the backdrop like a scrim

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 4; i++) { value += amplitude * noise(p); p = p * 2.03 + 11.7; amplitude *= 0.5; }
  return value;
}

// Four slow colour fields, folded by a noise flow, with fine contour lines so the glass
// always has edges to bend.
vec3 aurora(vec2 pixel) {
  vec2 q = pixel / max(u_size.x, u_size.y) * 2.4;
  float t = u_time * 0.045;
  vec2 warp = vec2(fbm(q + vec2(t, -t * 0.7)), fbm(q + vec2(-t * 0.6, t) + 5.2));
  vec2 p = q + warp * 1.35;
  vec3 color = u_base;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    vec2 center = vec2(0.6 + 1.1 * sin(t * (1.0 + fi * 0.37) + fi * 1.9), 0.55 + 0.75 * cos(t * (0.8 + fi * 0.29) + fi * 2.6));
    center *= vec2(max(u_size.x / u_size.y, 1.0), max(u_size.y / u_size.x, 1.0)) * 1.2;
    float reach = exp(-dot(p - center, p - center) * 1.15);
    color = mix(color, u_colors[i], clamp(reach * 1.25, 0.0, 1.0));
  }
  float height = fbm(p * 1.6 + t);
  float lines = abs(fract(height * 14.0) - 0.5);
  float line = 1.0 - smoothstep(0.0, 0.07, lines);
  color = mix(color, color * 1.35 + 0.06, line * 0.35);
  color += (hash(pixel + fract(u_time)) - 0.5) * 0.025;
  return color;
}

void main() {
  vec2 pixel = vec2(gl_FragCoord.x, u_size.y * u_dpr - gl_FragCoord.y) / u_dpr;
  vec2 uv = pixel / u_size;
  vec3 color;
  if (u_mode < 0.5) color = texture2D(u_image, vec2(u_crop.z + uv.x * u_crop.x, 1.0 - (u_crop.w + uv.y * u_crop.y))).rgb;
  else if (u_mode < 1.5) color = aurora(pixel);
  else color = u_base;
  gl_FragColor = vec4(color * (1.0 - u_dim), 1.0);
}
`, se = `precision highp float;
uniform sampler2D u_background;
uniform vec2 u_size;
uniform vec2 u_step;

vec3 sampleLinear(vec2 uv) {
  return pow(texture2D(u_background, clamp(uv, 0.001, 0.999)).rgb, vec3(2.2));
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_size;
  vec3 color = vec3(0.0);
  float total = 0.0;
  // The cached wider Gaussian prevents tiny granules from becoming ridges
  // when the bevel compresses the transmitted image's sampling footprint.
  for (int y = -2; y <= 2; y++) {
    for (int x = -2; x <= 2; x++) {
      vec2 offset = vec2(float(x), float(y));
      float weight = exp(-dot(offset, offset) * 0.5);
      color += sampleLinear(uv + offset * u_step) * weight;
      total += weight;
    }
  }
  color /= total;
  gl_FragColor = vec4(pow(color, vec3(1.0 / 2.2)), 1.0);
}
`, oe = `precision highp float;
// Every glass panel on the scene, drawn in one pass. A panel is a rounded rectangle with a
// convex rim: light passing near the edge bends inward (so the backdrop squeezes and
// magnifies there), splits slightly by colour, and catches a rim of light that follows
// the pointer. The flat middle stays clear, with an optional frost and tint.
#define MAX_PANES 16
uniform sampler2D u_scene;
uniform sampler2D u_frost;
uniform vec2 u_size;      // CSS pixels
uniform float u_dpr;
uniform int u_count;
uniform vec4 u_rect[MAX_PANES];  // centre x, centre y, half width, half height (CSS px)
uniform vec4 u_look[MAX_PANES];  // corner radius, bend (px), frost 0..1, rim width (px)
uniform vec4 u_tint[MAX_PANES];  // rgb, strength
uniform vec4 u_glow[MAX_PANES];  // press glow 0..1, shadow 0..1, chroma, unused
uniform vec3 u_light;            // light position (CSS px), pointer present 0..1

vec3 scene(vec2 pixel) {
  return texture2D(u_scene, clamp(vec2(pixel.x / u_size.x, 1.0 - pixel.y / u_size.y), 0.001, 0.999)).rgb;
}

vec3 frost(vec2 pixel) {
  return texture2D(u_frost, clamp(vec2(pixel.x / u_size.x, 1.0 - pixel.y / u_size.y), 0.001, 0.999)).rgb;
}

float box(vec2 p, vec2 halfSize, float radius) {
  vec2 q = abs(p) - halfSize + radius;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - radius;
}

void main() {
  vec2 pixel = vec2(gl_FragCoord.x, u_size.y * u_dpr - gl_FragCoord.y) / u_dpr;
  vec3 base = scene(pixel);

  // The nearest panel owns this pixel; every panel casts a soft shadow.
  float nearest = 1e5;
  vec4 rect = vec4(0.0);
  vec4 look = vec4(0.0);
  vec4 tint = vec4(0.0);
  vec4 glow = vec4(0.0);
  float shade = 0.0;
  for (int i = 0; i < MAX_PANES; i++) {
    if (i >= u_count) break;
    vec4 r = u_rect[i];
    float radius = min(u_look[i].x, min(r.z, r.w));
    float d = box(pixel - r.xy, r.zw, radius);
    float lift = min(r.w, 40.0);
    float s = box(pixel - r.xy - vec2(0.0, lift * 0.28), r.zw, radius);
    shade = max(shade, (1.0 - smoothstep(-lift * 0.4, lift * 0.9, s)) * u_glow[i].y);
    // Later panels sit on top (a knob on its track, a tab on its bar); outside any panel the nearest wins.
    bool take = d < 1.0 || (nearest >= 1.0 && d < nearest);
    if (take) { nearest = d; rect = r; look = u_look[i]; tint = u_tint[i]; glow = u_glow[i]; }
  }
  vec3 outside = base * (1.0 - shade * 0.28);
  if (nearest > 1.0) { gl_FragColor = vec4(outside, 1.0); return; }

  vec2 p = pixel - rect.xy;
  float radius = min(look.x, min(rect.z, rect.w));
  vec2 e = vec2(0.75, 0.0);
  vec2 normal = normalize(vec2(box(p + e.xy, rect.zw, radius) - box(p - e.xy, rect.zw, radius), box(p + e.yx, rect.zw, radius) - box(p - e.yx, rect.zw, radius)) + 1e-5);
  float rim = max(look.w, 1.0);
  float depth = clamp(-nearest / rim, 0.0, 1.0);   // 0 at the edge, 1 where the face is flat
  float edge = 1.0 - depth;
  // A circular rim profile: steepest at the edge, flat by the time it reaches the face.
  float bend = edge * edge * (3.0 - 2.0 * edge);
  vec2 offset = -normal * bend * look.y - p * 0.035 * depth;
  float chroma = glow.z;
  vec3 sharp = vec3(scene(pixel + offset * (1.0 + chroma)).r, scene(pixel + offset).g, scene(pixel + offset * (1.0 - chroma)).b);
  vec3 soft = frost(pixel + offset);
  vec3 color = mix(sharp, soft, clamp(look.z + edge * edge * 0.25, 0.0, 1.0));
  color = mix(color, tint.rgb, tint.a);
  color *= 1.03 + glow.x * 0.08;

  // Light: a bright rim on the side facing the light, a fainter one opposite, and a hairline edge.
  vec2 toLight = normalize(u_light.xy - pixel + 1e-5);
  float facing = dot(normal, toLight);
  float rimLight = pow(edge, 5.0) * (0.55 * max(facing, 0.0) + 0.18 * max(-facing, 0.0));
  float hairline = (1.0 - smoothstep(0.0, 1.6, -nearest)) * (0.32 + 0.3 * max(facing, 0.0));
  float sheen = exp(-dot(pixel - u_light.xy, pixel - u_light.xy) / (rect.z * rect.w * 0.9 + 400.0)) * 0.10 * u_light.z;
  color += vec3(1.0) * (rimLight + hairline + sheen + glow.x * 0.05);
  color *= 1.0 - pow(edge, 3.0) * 0.10 * max(normal.y, 0.0);

  float coverage = clamp(0.5 - nearest * u_dpr, 0.0, 1.0);
  gl_FragColor = vec4(mix(outside, color, coverage), 1.0);
}
`;
function ne(o, e, t, r) {
  if (![o, e, t, r].every((h) => Number.isFinite(h) && h > 0))
    throw new RangeError("Backdrop dimensions must be finite and positive.");
  const i = o / e, l = t / r, u = Math.min(1, i / l), b = Math.min(1, l / i);
  return [u, b, (1 - u) / 2, (1 - b) / 2];
}
function ae(o, e = () => new Image()) {
  return new Promise((t, r) => {
    const i = e();
    i.decoding = "async", i.crossOrigin = "anonymous", i.onload = () => {
      if (i.onload = null, i.onerror = null, i.naturalWidth <= 0 || i.naturalHeight <= 0) {
        r(new Error("The backdrop image has invalid image dimensions."));
        return;
      }
      t({ source: i, width: i.naturalWidth, height: i.naturalHeight });
    }, i.onerror = () => {
      i.onload = null, i.onerror = null, r(new Error("The backdrop image could not load; the procedural scene remains available."));
    }, i.src = o;
  });
}
const D = 16, le = "attribute vec2 a_position; void main() { gl_Position = vec4(a_position, 0.0, 1.0); }";
function ce(o) {
  const e = o.getContext("webgl", { alpha: !1, antialias: !1, premultipliedAlpha: !1, powerPreference: "low-power" });
  if (!e) throw new Error("WebGL is unavailable.");
  const t = [], r = [];
  function i(n, a) {
    const p = e.createShader(n);
    if (!p) throw new Error("Unable to allocate a glass shader.");
    if (e.shaderSource(p, a), e.compileShader(p), !e.getShaderParameter(p, e.COMPILE_STATUS)) {
      const y = e.getShaderInfoLog(p);
      throw e.deleteShader(p), new Error(`Glass shader failed: ${y}`);
    }
    return t.push(p), p;
  }
  function l(n) {
    const a = e.createProgram();
    if (!a) throw new Error("Unable to allocate the glass renderer.");
    if (e.attachShader(a, i(e.VERTEX_SHADER, le)), e.attachShader(a, i(e.FRAGMENT_SHADER, n)), e.linkProgram(a), !e.getProgramParameter(a, e.LINK_STATUS)) throw new Error(`Glass renderer failed to link: ${e.getProgramInfoLog(a)}`);
    return r.push(a), a;
  }
  function u() {
    const n = e.createTexture();
    if (!n) throw new Error("Unable to allocate a glass texture.");
    return e.bindTexture(e.TEXTURE_2D, n), e.texParameteri(e.TEXTURE_2D, e.TEXTURE_MIN_FILTER, e.LINEAR), e.texParameteri(e.TEXTURE_2D, e.TEXTURE_MAG_FILTER, e.LINEAR), e.texParameteri(e.TEXTURE_2D, e.TEXTURE_WRAP_S, e.CLAMP_TO_EDGE), e.texParameteri(e.TEXTURE_2D, e.TEXTURE_WRAP_T, e.CLAMP_TO_EDGE), e.texImage2D(e.TEXTURE_2D, 0, e.RGBA, 1, 1, 0, e.RGBA, e.UNSIGNED_BYTE, new Uint8Array([20, 24, 40, 255])), n;
  }
  const b = l(ie), h = l(se), T = l(oe), _ = e.createBuffer(), m = u(), A = u(), X = u(), R = e.createFramebuffer(), d = e.createFramebuffer();
  if (!_ || !R || !d) throw new Error("Unable to allocate glass buffers.");
  e.bindBuffer(e.ARRAY_BUFFER, _), e.bufferData(e.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), e.STATIC_DRAW);
  const f = (n, a) => Object.fromEntries(a.map((p) => [p, e.getUniformLocation(n, p)])), s = f(b, ["u_size", "u_dpr", "u_mode", "u_image", "u_crop", "u_time", "u_colors[0]", "u_base", "u_dim"]), v = f(h, ["u_background", "u_size", "u_step"]), g = f(T, ["u_scene", "u_frost", "u_size", "u_dpr", "u_count", "u_rect[0]", "u_look[0]", "u_tint[0]", "u_glow[0]", "u_light"]), P = new Float32Array(D * 4), w = new Float32Array(D * 4), z = new Float32Array(D * 4), C = new Float32Array(D * 4);
  let F = 1, U = 1, S = 1, B = !1, L = !1, N = 1, V = 0, I = { width: 1, height: 1 }, q = new Float32Array([1, 0.35, 0.12, 1, 0.18, 0.54, 0.42, 0.23, 1, 0, 0.76, 1]), G = new Float32Array([0.04, 0.03, 0.12]);
  function Y(n) {
    e.useProgram(n), e.bindBuffer(e.ARRAY_BUFFER, _);
    const a = e.getAttribLocation(n, "a_position");
    e.enableVertexAttribArray(a), e.vertexAttribPointer(a, 2, e.FLOAT, !1, 0, 0);
  }
  function O(n, a, p, y) {
    if (e.bindTexture(e.TEXTURE_2D, a), e.texImage2D(e.TEXTURE_2D, 0, e.RGBA, p, y, 0, e.RGBA, e.UNSIGNED_BYTE, null), e.bindFramebuffer(e.FRAMEBUFFER, n), e.framebufferTexture2D(e.FRAMEBUFFER, e.COLOR_ATTACHMENT0, e.TEXTURE_2D, a, 0), e.checkFramebufferStatus(e.FRAMEBUFFER) !== e.FRAMEBUFFER_COMPLETE) throw new Error("A glass framebuffer is incomplete.");
  }
  function H(n, a) {
    F = Math.max(1, n), U = Math.max(1, a), S = Math.min(window.devicePixelRatio || 1, 2), o.width = Math.round(F * S), o.height = Math.round(U * S), O(R, A, o.width, o.height), O(d, X, Math.max(1, Math.ceil(o.width / 4)), Math.max(1, Math.ceil(o.height / 4))), e.bindFramebuffer(e.FRAMEBUFFER, null), B = !0;
  }
  function j(n, a = 1, p = 1) {
    N = n === "wait" ? 2 : n ? 0 : 1, !(!n || n === "wait") && (I = { width: Math.max(1, a), height: Math.max(1, p) }, e.bindTexture(e.TEXTURE_2D, m), e.pixelStorei(e.UNPACK_FLIP_Y_WEBGL, !0), e.texImage2D(e.TEXTURE_2D, 0, e.RGBA, e.RGBA, e.UNSIGNED_BYTE, n), e.pixelStorei(e.UNPACK_FLIP_Y_WEBGL, !1));
  }
  function K(n, a) {
    q = new Float32Array(Array.from({ length: 4 }, (p, y) => n[y % n.length]).flat()), G = new Float32Array(a);
  }
  function Q(n) {
    V = Math.min(0.9, Math.max(0, Number.isFinite(n) ? n : 0));
  }
  function J(n) {
    if (L || !B) return;
    e.bindFramebuffer(e.FRAMEBUFFER, R), e.viewport(0, 0, o.width, o.height), Y(b), e.activeTexture(e.TEXTURE0), e.bindTexture(e.TEXTURE_2D, m), e.uniform1i(s.u_image, 0), e.uniform2f(s.u_size, F, U), e.uniform1f(s.u_dpr, S), e.uniform1f(s.u_mode, N), e.uniform4f(s.u_crop, ...ne(F, U, I.width, I.height)), e.uniform1f(s.u_time, n), e.uniform3fv(s["u_colors[0]"], q), e.uniform3fv(s.u_base, G), e.uniform1f(s.u_dim, V), e.drawArrays(e.TRIANGLES, 0, 3);
    const a = Math.max(1, Math.ceil(o.width / 4)), p = Math.max(1, Math.ceil(o.height / 4));
    e.bindFramebuffer(e.FRAMEBUFFER, d), e.viewport(0, 0, a, p), Y(h), e.bindTexture(e.TEXTURE_2D, A), e.uniform1i(v.u_background, 0), e.uniform2f(v.u_size, a, p), e.uniform2f(v.u_step, 5 * S / o.width, 5 * S / o.height), e.drawArrays(e.TRIANGLES, 0, 3), e.bindFramebuffer(e.FRAMEBUFFER, null);
  }
  function Z(n, a) {
    if (L || !B) return;
    const p = Math.min(D, n.length);
    for (let y = 0; y < p; y += 1) {
      const x = n[y];
      P.set([x.x, x.y, x.halfWidth, x.halfHeight], y * 4), w.set([x.radius, x.bend, x.frost, x.rim], y * 4), z.set(x.tint, y * 4), C.set([x.glow, x.shadow, x.chroma, 0], y * 4);
    }
    e.bindFramebuffer(e.FRAMEBUFFER, null), e.viewport(0, 0, o.width, o.height), Y(T), e.activeTexture(e.TEXTURE0), e.bindTexture(e.TEXTURE_2D, A), e.activeTexture(e.TEXTURE1), e.bindTexture(e.TEXTURE_2D, X), e.uniform1i(g.u_scene, 0), e.uniform1i(g.u_frost, 1), e.uniform2f(g.u_size, F, U), e.uniform1f(g.u_dpr, S), e.uniform1i(g.u_count, p), e.uniform4fv(g["u_rect[0]"], P), e.uniform4fv(g["u_look[0]"], w), e.uniform4fv(g["u_tint[0]"], z), e.uniform4fv(g["u_glow[0]"], C), e.uniform3f(g.u_light, a.x, a.y, a.present), e.drawArrays(e.TRIANGLES, 0, 3), e.activeTexture(e.TEXTURE0);
  }
  function ee() {
    L || (L = !0, t.forEach((n) => e.deleteShader(n)), r.forEach((n) => e.deleteProgram(n)), [m, A, X].forEach((n) => e.deleteTexture(n)), e.deleteFramebuffer(R), e.deleteFramebuffer(d), e.deleteBuffer(_), e.getExtension("WEBGL_lose_context")?.loseContext());
  }
  return { resize: H, setSource: j, setAurora: K, setDim: Q, drawScene: J, drawGlass: Z, destroy: ee };
}
function E(o, e, t) {
  return Math.min(t, Math.max(e, o));
}
function k(o, e, t, r, i = 420, l = 18) {
  const u = E(Number.isFinite(r) ? r : 0, 0, 0.06666666666666667), b = Math.max(1, Math.ceil(u / (1 / 240))), h = u / b;
  let T = o, _ = e;
  for (let m = 0; m < b; m += 1)
    _ += ((t - T) * i - _ * l) * h, T += _ * h;
  return [T, _];
}
function he(o, e, t) {
  const r = (o || "").trim().split(/\s+/)[0] ?? "", i = parseFloat(r);
  if (!Number.isFinite(i) || i <= 0) return 0;
  const l = Math.min(e, t), u = r.endsWith("%") ? i / 100 * l : i;
  return E(u, 0, l / 2);
}
function M(o, e, t = -1 / 0, r = 1 / 0) {
  const i = parseFloat(o);
  return Number.isFinite(i) ? E(i, t, r) : e;
}
function ue(o) {
  const e = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)/.exec(o || "");
  if (!e) return null;
  const t = e[4], r = t === void 0 ? 1 : t.endsWith("%") ? parseFloat(t) / 100 : parseFloat(t);
  return [Number(e[1]) / 255, Number(e[2]) / 255, Number(e[3]) / 255, E(r, 0, 1)];
}
function de(o) {
  return /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(o);
}
const fe = [[1, 0.35, 0.12], [1, 0.18, 0.54], [0.42, 0.23, 1], [0, 0.76, 1]], pe = [0.04, 0.03, 0.12], W = document.createElement("template");
W.innerHTML = `<style>
:host { display: block; position: relative; isolation: isolate; overflow: hidden; min-height: 120px; color: #fff; background: #0a0818; }
:host([hidden]) { display: none; }
canvas { position: absolute; inset: 0; width: 100%; height: 100%; z-index: 0; pointer-events: none; opacity: 0; transition: opacity .5s; }
:host([data-ready]) canvas { opacity: 1; }
.fallback { position: absolute; inset: 0; z-index: 0; background: var(--image, linear-gradient(120deg, #ff5a1f, #ff2d8a 35%, #6a3bff 65%, #00c2ff)) center / cover no-repeat; }
:host([data-renderer='webgl'][data-ready]) .fallback { display: none; }
.content { position: relative; z-index: 1; height: 100%; }
</style><div class="fallback" part="fallback"></div><canvas part="canvas" aria-hidden="true"></canvas><div class="content" part="content"><slot></slot></div>`;
const me = `
liquid-glass [glass] { -webkit-tap-highlight-color: transparent; }
liquid-glass [glass-drag] { touch-action: none; cursor: grab; user-select: none; }
liquid-glass [glass-drag]:active { cursor: grabbing; }
liquid-glass:not([data-renderer='webgl']) [glass] { background: rgba(255,255,255,.16); border: 1px solid rgba(255,255,255,.38); box-shadow: inset 0 1px 1px rgba(255,255,255,.6), 0 10px 30px rgba(0,0,0,.18); backdrop-filter: blur(14px) saturate(1.7); -webkit-backdrop-filter: blur(14px) saturate(1.7); }`;
class $ extends HTMLElement {
  constructor() {
    super();
    c(this, "canvas");
    c(this, "fallback");
    c(this, "renderer", null);
    c(this, "states", /* @__PURE__ */ new WeakMap());
    c(this, "colorProbe", document.createElement("span"));
    c(this, "colorCache", /* @__PURE__ */ new Map());
    c(this, "motionQuery", window.matchMedia("(prefers-reduced-motion: reduce)"));
    c(this, "events", null);
    c(this, "resizeObserver", null);
    c(this, "visibility", null);
    c(this, "mutations", null);
    c(this, "video", null);
    c(this, "animatedScene", !0);
    c(this, "sceneDirty", !0);
    c(this, "stylesDirty", !0);
    c(this, "onScreen", !0);
    c(this, "frameId", 0);
    c(this, "frameCount", 0);
    c(this, "lastFrame", 0);
    c(this, "time", 0);
    c(this, "width", 1);
    c(this, "height", 1);
    c(this, "lastSignature", "");
    c(this, "backdropRequest", 0);
    c(this, "pointer", { x: 0, y: 0, inside: !1, down: !1, target: null });
    c(this, "light", { x: 0, y: 0, present: 0, vx: 0, vy: 0, presentVelocity: 0 });
    const t = this.attachShadow({ mode: "open" });
    if (t.append(W.content.cloneNode(!0)), this.canvas = t.querySelector("canvas"), this.fallback = t.querySelector(".fallback"), this.colorProbe.hidden = !0, t.append(this.colorProbe), !document.getElementById("liquid-glass-style")) {
      const r = document.createElement("style");
      r.id = "liquid-glass-style", r.textContent = me, document.head.append(r);
    }
  }
  /** 'aurora' (default), or the URL of an image or video to refract. */
  get backdrop() {
    return this.getAttribute("backdrop") || "aurora";
  }
  set backdrop(t) {
    this.setAttribute("backdrop", t);
  }
  /** The glass elements this scene renders (at most 16). */
  get panes() {
    return Array.from(this.querySelectorAll("[glass]")).slice(0, D);
  }
  connectedCallback() {
    this.events = new AbortController();
    const t = this.events.signal;
    try {
      this.renderer = ce(this.canvas), this.dataset.renderer = "webgl";
    } catch (r) {
      console.warn("liquid-glass: WebGL is unavailable, using frosted CSS glass.", r), this.dataset.renderer = "css";
    }
    this.resizeObserver = new ResizeObserver(() => this.resize()), this.resizeObserver.observe(this), this.visibility = new IntersectionObserver(([r]) => {
      this.onScreen = r.isIntersecting, this.onScreen ? this.start() : this.stop();
    }), this.visibility.observe(this), this.mutations = new MutationObserver(() => {
      this.stylesDirty = !0;
    }), this.mutations.observe(this, { subtree: !0, childList: !0, attributes: !0 }), this.resize(), this.applyDim(), this.applyBackdrop(), this.addEventListener("pointermove", (r) => this.movePointer(r), { passive: !0, signal: t }), this.addEventListener("pointerenter", (r) => this.movePointer(r), { passive: !0, signal: t }), this.addEventListener("pointerleave", () => {
      this.pointer.inside = !1;
    }, { signal: t }), this.addEventListener("pointerdown", (r) => this.press(r), { signal: t }), window.addEventListener("pointerup", (r) => this.release(r), { signal: t }), window.addEventListener("pointercancel", (r) => this.release(r), { signal: t }), window.addEventListener("pointermove", (r) => this.dragMove(r), { passive: !0, signal: t }), document.addEventListener("visibilitychange", () => {
      document.hidden ? this.stop() : this.start();
    }, { signal: t }), this.canvas.addEventListener("webglcontextlost", (r) => {
      r.preventDefault(), this.renderer?.destroy(), this.renderer = null, this.dataset.renderer = "css";
    }, { signal: t }), this.start();
  }
  disconnectedCallback() {
    this.stop(), this.events?.abort(), this.resizeObserver?.disconnect(), this.visibility?.disconnect(), this.mutations?.disconnect(), this.video?.pause(), this.video = null, this.renderer?.destroy(), this.renderer = null, delete this.dataset.ready;
  }
  attributeChangedCallback(t, r, i) {
    r === i || !this.isConnected || ((t === "backdrop" || t === "colors") && this.applyBackdrop(), t === "dim" && this.applyDim());
  }
  // ---- the backdrop
  applyBackdrop() {
    const t = ++this.backdropRequest, r = this.backdrop.trim();
    if (this.video?.pause(), this.video = null, r === "aurora" || !r) {
      this.renderer?.setAurora(this.auroraColors(), pe), this.renderer?.setSource(null), this.fallback.style.removeProperty("--image"), this.animatedScene = !0, this.sceneDirty = !0, this.dataset.ready = "";
      return;
    }
    if (this.fallback.style.setProperty("--image", `url("${r.replace(/"/g, "%22")}")`), this.renderer?.setSource("wait"), this.sceneDirty = !0, de(r)) {
      const i = document.createElement("video");
      Object.assign(i, { muted: !0, loop: !0, playsInline: !0, autoplay: !0, crossOrigin: "anonymous", src: r }), i.setAttribute("muted", ""), this.video = i, this.animatedScene = !0, i.addEventListener("playing", () => {
        t === this.backdropRequest && (this.dataset.ready = "");
      }, { once: !0 }), i.play().catch(() => {
      });
      return;
    }
    this.animatedScene = !1, ae(r).then((i) => {
      t === this.backdropRequest && (this.renderer?.setSource(i.source, i.width, i.height), this.sceneDirty = !0, this.dataset.ready = "");
    }).catch((i) => {
      t === this.backdropRequest && (console.warn(`liquid-glass: the backdrop "${r}" could not load (images on other sites need CORS headers). Showing the aurora.`, i), this.renderer?.setSource(null), this.animatedScene = !0, this.sceneDirty = !0, this.dataset.ready = "");
    });
  }
  applyDim() {
    const t = M(this.getAttribute("dim") ?? "", 0, 0, 0.9);
    this.renderer?.setDim(t), this.fallback.style.filter = t ? `brightness(${1 - t})` : "", this.sceneDirty = !0;
  }
  auroraColors() {
    const t = (this.getAttribute("colors") || "").split(/[\s,]+/).filter(Boolean).map((r) => this.resolveColor(r)).filter((r) => r[3] > 0);
    return t.length ? t.map(([r, i, l]) => [r, i, l]) : fe;
  }
  // ---- reading the panes
  resolveColor(t) {
    const r = this.colorCache.get(t);
    if (r) return r;
    this.colorProbe.style.color = "", this.colorProbe.style.color = t;
    const i = (this.colorProbe.style.color ? ue(getComputedStyle(this.colorProbe).color) : null) ?? [0, 0, 0, 0];
    return this.colorCache.set(t, i), i;
  }
  readLook(t, r, i) {
    const l = getComputedStyle(t), u = Math.min(r, i), b = l.getPropertyValue("--glass-tint").trim();
    return {
      radius: he(l.borderTopLeftRadius, r, i),
      bend: M(l.getPropertyValue("--glass-bend"), E(u * 0.32, 6, 34), 0, 200),
      rim: M(l.getPropertyValue("--glass-rim"), E(u * 0.42, 8, 48), 1, 300),
      frost: M(l.getPropertyValue("--glass-frost"), 0.08, 0, 1),
      tint: b ? this.resolveColor(b) : [1, 1, 1, 0.04],
      shadow: M(l.getPropertyValue("--glass-shadow"), 1, 0, 1),
      chroma: M(l.getPropertyValue("--glass-chroma"), 0.06, 0, 0.3),
      press: M(l.getPropertyValue("--glass-press"), 1.045, 0.8, 1.3)
    };
  }
  state(t) {
    let r = this.states.get(t);
    return r || (r = { scale: 1, scaleVelocity: 0, glow: 0, glowVelocity: 0, stretchX: 1, stretchXVelocity: 0, stretchY: 1, stretchYVelocity: 0, look: null, drag: null, offsetX: 0, offsetY: 0 }, this.states.set(t, r)), r;
  }
  // ---- pointer: light, press, drag
  movePointer(t) {
    const r = this.getBoundingClientRect();
    this.pointer.x = t.clientX - r.left, this.pointer.y = t.clientY - r.top, this.pointer.inside = !0;
  }
  press(t) {
    this.movePointer(t);
    const r = t.target?.closest?.("[glass]");
    if (!(!r || !this.contains(r)) && (this.pointer.down = !0, this.pointer.target = r, r.hasAttribute("glass-drag"))) {
      const i = this.state(r);
      i.drag = { pointer: t.pointerId, startX: t.clientX, startY: t.clientY, baseX: i.offsetX, baseY: i.offsetY, lastX: t.clientX, lastY: t.clientY, lastT: t.timeStamp, vx: 0, vy: 0 }, r.setPointerCapture?.(t.pointerId);
    }
  }
  dragMove(t) {
    const r = this.pointer.target, i = r ? this.states.get(r)?.drag : null;
    if (!r || !i || i.pointer !== t.pointerId) return;
    const l = this.state(r), u = Math.max(1, t.timeStamp - i.lastT) / 1e3;
    i.vx = i.vx * 0.6 + (t.clientX - i.lastX) / u * 0.4, i.vy = i.vy * 0.6 + (t.clientY - i.lastY) / u * 0.4, i.lastX = t.clientX, i.lastY = t.clientY, i.lastT = t.timeStamp, l.offsetX = i.baseX + t.clientX - i.startX, l.offsetY = i.baseY + t.clientY - i.startY, r.style.translate = `${l.offsetX}px ${l.offsetY}px`;
  }
  release(t) {
    const r = this.pointer.target;
    if (r) {
      const i = this.states.get(r);
      i?.drag && i.drag.pointer === t.pointerId && (i.drag = null);
    }
    this.pointer.down = !1, this.pointer.target = null;
  }
  // ---- the frame loop
  resize() {
    const t = this.getBoundingClientRect();
    this.width = Math.max(1, t.width), this.height = Math.max(1, t.height);
    try {
      this.renderer?.resize(this.width, this.height);
    } catch (r) {
      console.warn(r), this.renderer?.destroy(), this.renderer = null, this.dataset.renderer = "css";
    }
    this.sceneDirty = !0, this.stylesDirty = !0, this.lastSignature = "";
  }
  start() {
    this.frameId || !this.isConnected || !this.onScreen || document.hidden || (this.lastFrame = performance.now(), this.frameId = requestAnimationFrame((t) => this.frame(t)));
  }
  stop() {
    cancelAnimationFrame(this.frameId), this.frameId = 0;
  }
  frame(t) {
    this.frameId = requestAnimationFrame((d) => this.frame(d));
    const r = this.renderer;
    if (!r) return;
    const i = E((t - this.lastFrame) / 1e3, 0, 1 / 15);
    this.lastFrame = t, this.frameCount += 1;
    const l = this.motionQuery.matches || this.hasAttribute("reduce-motion"), u = this.video;
    u && u.readyState >= 2 && (r.setSource(u, u.videoWidth, u.videoHeight), this.sceneDirty = !0), this.animatedScene && !l && (this.time += i, this.sceneDirty = !0);
    const b = this.sceneDirty;
    this.sceneDirty && (r.drawScene(this.time), this.sceneDirty = !1);
    const h = this.light, T = this.pointer.inside ? this.pointer.x : this.width * 0.18, _ = this.pointer.inside ? this.pointer.y : -this.height * 0.25;
    [h.x, h.vx] = k(h.x, h.vx, T, i, 160, 22), [h.y, h.vy] = k(h.y, h.vy, _, i, 160, 22), [h.present, h.presentVelocity] = k(h.present, h.presentVelocity, this.pointer.inside ? 1 : 0, i, 90, 18), (this.stylesDirty || this.frameCount % 30 === 0) && this.panes.forEach((d) => {
      this.state(d).look = null;
    }), this.stylesDirty = !1;
    const m = this.getBoundingClientRect(), A = [];
    let X = Math.abs(h.vx) + Math.abs(h.vy) > 0.5 || Math.abs(h.presentVelocity) > 0.01;
    for (const d of this.panes) {
      const f = d.getBoundingClientRect();
      if (f.width < 1 || f.height < 1 || f.right < m.left || f.left > m.right || f.bottom < m.top || f.top > m.bottom) continue;
      const s = this.state(d);
      s.look ?? (s.look = this.readLook(d, f.width, f.height));
      const v = s.look, g = this.pointer.down && this.pointer.target === d, P = this.pointer.inside && this.pointer.x >= f.left - m.left && this.pointer.x <= f.right - m.left && this.pointer.y >= f.top - m.top && this.pointer.y <= f.bottom - m.top, w = s.drag, z = g ? v.press : P ? 1 + (v.press - 1) * 0.3 : 1, C = w ? E(Math.abs(w.vx) / 2600, 0, 0.22) : 0, F = w ? E(Math.abs(w.vy) / 2600, 0, 0.22) : 0;
      l ? Object.assign(s, { scale: z, scaleVelocity: 0, stretchX: 1, stretchY: 1, stretchXVelocity: 0, stretchYVelocity: 0, glow: g ? 1 : 0, glowVelocity: 0 }) : ([s.scale, s.scaleVelocity] = k(s.scale, s.scaleVelocity, z, i, 520, 14), [s.stretchX, s.stretchXVelocity] = k(s.stretchX, s.stretchXVelocity, 1 + C - F * 0.5, i, 300, 12), [s.stretchY, s.stretchYVelocity] = k(s.stretchY, s.stretchYVelocity, 1 + F - C * 0.5, i, 300, 12), [s.glow, s.glowVelocity] = k(s.glow, s.glowVelocity, g ? 1 : P ? 0.35 : 0, i, 260, 22)), w && (w.vx *= 0.9, w.vy *= 0.9), X || (X = Math.abs(s.scaleVelocity) + Math.abs(s.stretchXVelocity) + Math.abs(s.stretchYVelocity) + Math.abs(s.glowVelocity) > 2e-3), A.push({
        x: f.left - m.left + f.width / 2,
        y: f.top - m.top + f.height / 2,
        halfWidth: f.width / 2 * s.scale * s.stretchX,
        halfHeight: f.height / 2 * s.scale * s.stretchY,
        radius: v.radius * s.scale,
        bend: v.bend,
        frost: v.frost,
        rim: v.rim,
        tint: v.tint,
        glow: s.glow,
        shadow: v.shadow,
        chroma: v.chroma
      });
    }
    const R = A.map((d) => `${d.x.toFixed(1)},${d.y.toFixed(1)},${d.halfWidth.toFixed(1)},${d.halfHeight.toFixed(1)},${d.radius},${d.bend},${d.frost},${d.rim},${d.tint.join(",")}`).join("|");
    !b && !X && R === this.lastSignature || (this.lastSignature = R, r.drawGlass(A, { x: h.x, y: h.y, present: h.present }));
  }
}
c($, "observedAttributes", ["backdrop", "colors", "dim"]);
typeof customElements < "u" && !customElements.get("liquid-glass") && customElements.define("liquid-glass", $);
export {
  $ as LiquidGlassElement
};
