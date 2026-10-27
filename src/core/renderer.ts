import sceneFragment from './scene.frag?raw';
import frostFragment from './frost.frag?raw';
import glassFragment from './glass.frag?raw';
import { getBackdropCrop } from './backdrop';

export const MAX_PANES = 16;

/** One glass panel in scene pixels, with how it looks this frame. */
export interface Pane {
  x: number;          // centre
  y: number;
  halfWidth: number;
  halfHeight: number;
  radius: number;
  bend: number;       // how far the rim pulls the backdrop, in px
  frost: number;      // 0 clear, 1 fully frosted
  rim: number;        // width of the curved rim, in px
  tint: [number, number, number, number]; // rgb 0..1 and strength
  glow: number;       // press highlight 0..1
  shadow: number;     // 0..1
  chroma: number;     // colour split at the rim, e.g. 0.06
}

export interface GlassRenderer {
  resize: (width: number, height: number) => void;
  /** Use an image or a playing video as the backdrop; null switches to the aurora, 'wait' to the plain base colour. */
  setSource: (source: TexImageSource | null | 'wait', width?: number, height?: number) => void;
  setAurora: (colors: [number, number, number][], base: [number, number, number]) => void;
  /** Darken the backdrop, 0..1, so text over it stays readable. */
  setDim: (dim: number) => void;
  /** Redraw the backdrop (each frame for video or the aurora, once for a still image). */
  drawScene: (time: number) => void;
  drawGlass: (panes: Pane[], light: { x: number; y: number; present: number }) => void;
  destroy: () => void;
}

const vertexSource = 'attribute vec2 a_position; void main() { gl_Position = vec4(a_position, 0.0, 1.0); }';

/** A three-pass WebGL renderer: backdrop into a texture, a blurred copy for frost, then all glass panels at once. */
export function createGlassRenderer(canvas: HTMLCanvasElement): GlassRenderer {
  const gl = canvas.getContext('webgl', { alpha: false, antialias: false, premultipliedAlpha: false, powerPreference: 'low-power' });
  if (!gl) throw new Error('WebGL is unavailable.');
  const shaders: WebGLShader[] = [];
  const programs: WebGLProgram[] = [];

  function compile(type: number, source: string): WebGLShader {
    const shader = gl!.createShader(type);
    if (!shader) throw new Error('Unable to allocate a glass shader.');
    gl!.shaderSource(shader, source);
    gl!.compileShader(shader);
    if (!gl!.getShaderParameter(shader, gl!.COMPILE_STATUS)) {
      const message = gl!.getShaderInfoLog(shader);
      gl!.deleteShader(shader);
      throw new Error(`Glass shader failed: ${message}`);
    }
    shaders.push(shader);
    return shader;
  }

  function program(fragment: string): WebGLProgram {
    const linked = gl!.createProgram();
    if (!linked) throw new Error('Unable to allocate the glass renderer.');
    gl!.attachShader(linked, compile(gl!.VERTEX_SHADER, vertexSource));
    gl!.attachShader(linked, compile(gl!.FRAGMENT_SHADER, fragment));
    gl!.linkProgram(linked);
    if (!gl!.getProgramParameter(linked, gl!.LINK_STATUS)) throw new Error(`Glass renderer failed to link: ${gl!.getProgramInfoLog(linked)}`);
    programs.push(linked);
    return linked;
  }

  function texture(): WebGLTexture {
    const made = gl!.createTexture();
    if (!made) throw new Error('Unable to allocate a glass texture.');
    gl!.bindTexture(gl!.TEXTURE_2D, made);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.LINEAR);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.LINEAR);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE);
    gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA, 1, 1, 0, gl!.RGBA, gl!.UNSIGNED_BYTE, new Uint8Array([20, 24, 40, 255]));
    return made;
  }

  const sceneProgram = program(sceneFragment);
  const frostProgram = program(frostFragment);
  const glassProgram = program(glassFragment);
  const buffer = gl.createBuffer();
  const sourceTexture = texture();
  const sceneTexture = texture();
  const frostTexture = texture();
  const sceneTarget = gl.createFramebuffer();
  const frostTarget = gl.createFramebuffer();
  if (!buffer || !sceneTarget || !frostTarget) throw new Error('Unable to allocate glass buffers.');
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

  const uniforms = (target: WebGLProgram, names: string[]) => Object.fromEntries(names.map((name) => [name, gl.getUniformLocation(target, name)]));
  const sceneU = uniforms(sceneProgram, ['u_size', 'u_dpr', 'u_mode', 'u_image', 'u_crop', 'u_time', 'u_colors[0]', 'u_base', 'u_dim']);
  const frostU = uniforms(frostProgram, ['u_background', 'u_size', 'u_step']);
  const glassU = uniforms(glassProgram, ['u_scene', 'u_frost', 'u_size', 'u_dpr', 'u_count', 'u_rect[0]', 'u_look[0]', 'u_tint[0]', 'u_glow[0]', 'u_light']);

  const rects = new Float32Array(MAX_PANES * 4);
  const looks = new Float32Array(MAX_PANES * 4);
  const tints = new Float32Array(MAX_PANES * 4);
  const glows = new Float32Array(MAX_PANES * 4);
  let width = 1;
  let height = 1;
  let dpr = 1;
  let sized = false;
  let destroyed = false;
  let mode = 1;
  let dim = 0;
  let sourceSize = { width: 1, height: 1 };
  let colors = new Float32Array([1, 0.35, 0.12, 1, 0.18, 0.54, 0.42, 0.23, 1, 0, 0.76, 1]);
  let base = new Float32Array([0.04, 0.03, 0.12]);

  function bind(target: WebGLProgram): void {
    gl!.useProgram(target);
    gl!.bindBuffer(gl!.ARRAY_BUFFER, buffer);
    const position = gl!.getAttribLocation(target, 'a_position');
    gl!.enableVertexAttribArray(position);
    gl!.vertexAttribPointer(position, 2, gl!.FLOAT, false, 0, 0);
  }

  function allocate(target: WebGLFramebuffer, attached: WebGLTexture, w: number, h: number): void {
    gl!.bindTexture(gl!.TEXTURE_2D, attached);
    gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA, w, h, 0, gl!.RGBA, gl!.UNSIGNED_BYTE, null);
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, target);
    gl!.framebufferTexture2D(gl!.FRAMEBUFFER, gl!.COLOR_ATTACHMENT0, gl!.TEXTURE_2D, attached, 0);
    if (gl!.checkFramebufferStatus(gl!.FRAMEBUFFER) !== gl!.FRAMEBUFFER_COMPLETE) throw new Error('A glass framebuffer is incomplete.');
  }

  function resize(nextWidth: number, nextHeight: number): void {
    width = Math.max(1, nextWidth);
    height = Math.max(1, nextHeight);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    allocate(sceneTarget!, sceneTexture, canvas.width, canvas.height);
    allocate(frostTarget!, frostTexture, Math.max(1, Math.ceil(canvas.width / 4)), Math.max(1, Math.ceil(canvas.height / 4)));
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
    sized = true;
  }

  function setSource(source: TexImageSource | null | 'wait', w = 1, h = 1): void {
    mode = source === 'wait' ? 2 : source ? 0 : 1;
    if (!source || source === 'wait') return;
    sourceSize = { width: Math.max(1, w), height: Math.max(1, h) };
    gl!.bindTexture(gl!.TEXTURE_2D, sourceTexture);
    gl!.pixelStorei(gl!.UNPACK_FLIP_Y_WEBGL, true);
    gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA, gl!.RGBA, gl!.UNSIGNED_BYTE, source);
    gl!.pixelStorei(gl!.UNPACK_FLIP_Y_WEBGL, false);
  }

  function setAurora(next: [number, number, number][], nextBase: [number, number, number]): void {
    colors = new Float32Array(Array.from({ length: 4 }, (_, index) => next[index % next.length]).flat());
    base = new Float32Array(nextBase);
  }

  function setDim(next: number): void {
    dim = Math.min(0.9, Math.max(0, Number.isFinite(next) ? next : 0));
  }

  function drawScene(time: number): void {
    if (destroyed || !sized) return;
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, sceneTarget);
    gl!.viewport(0, 0, canvas.width, canvas.height);
    bind(sceneProgram);
    gl!.activeTexture(gl!.TEXTURE0);
    gl!.bindTexture(gl!.TEXTURE_2D, sourceTexture);
    gl!.uniform1i(sceneU.u_image, 0);
    gl!.uniform2f(sceneU.u_size, width, height);
    gl!.uniform1f(sceneU.u_dpr, dpr);
    gl!.uniform1f(sceneU.u_mode, mode);
    gl!.uniform4f(sceneU.u_crop, ...getBackdropCrop(width, height, sourceSize.width, sourceSize.height));
    gl!.uniform1f(sceneU.u_time, time);
    gl!.uniform3fv(sceneU['u_colors[0]'], colors);
    gl!.uniform3fv(sceneU.u_base, base);
    gl!.uniform1f(sceneU.u_dim, dim);
    gl!.drawArrays(gl!.TRIANGLES, 0, 3);
    const frostWidth = Math.max(1, Math.ceil(canvas.width / 4));
    const frostHeight = Math.max(1, Math.ceil(canvas.height / 4));
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, frostTarget);
    gl!.viewport(0, 0, frostWidth, frostHeight);
    bind(frostProgram);
    gl!.bindTexture(gl!.TEXTURE_2D, sceneTexture);
    gl!.uniform1i(frostU.u_background, 0);
    gl!.uniform2f(frostU.u_size, frostWidth, frostHeight);
    gl!.uniform2f(frostU.u_step, 5 * dpr / canvas.width, 5 * dpr / canvas.height);
    gl!.drawArrays(gl!.TRIANGLES, 0, 3);
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
  }

  function drawGlass(panes: Pane[], light: { x: number; y: number; present: number }): void {
    if (destroyed || !sized) return;
    const count = Math.min(MAX_PANES, panes.length);
    for (let index = 0; index < count; index += 1) {
      const pane = panes[index];
      rects.set([pane.x, pane.y, pane.halfWidth, pane.halfHeight], index * 4);
      looks.set([pane.radius, pane.bend, pane.frost, pane.rim], index * 4);
      tints.set(pane.tint, index * 4);
      glows.set([pane.glow, pane.shadow, pane.chroma, 0], index * 4);
    }
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
    gl!.viewport(0, 0, canvas.width, canvas.height);
    bind(glassProgram);
    gl!.activeTexture(gl!.TEXTURE0);
    gl!.bindTexture(gl!.TEXTURE_2D, sceneTexture);
    gl!.activeTexture(gl!.TEXTURE1);
    gl!.bindTexture(gl!.TEXTURE_2D, frostTexture);
    gl!.uniform1i(glassU.u_scene, 0);
    gl!.uniform1i(glassU.u_frost, 1);
    gl!.uniform2f(glassU.u_size, width, height);
    gl!.uniform1f(glassU.u_dpr, dpr);
    gl!.uniform1i(glassU.u_count, count);
    gl!.uniform4fv(glassU['u_rect[0]'], rects);
    gl!.uniform4fv(glassU['u_look[0]'], looks);
    gl!.uniform4fv(glassU['u_tint[0]'], tints);
    gl!.uniform4fv(glassU['u_glow[0]'], glows);
    gl!.uniform3f(glassU.u_light, light.x, light.y, light.present);
    gl!.drawArrays(gl!.TRIANGLES, 0, 3);
    gl!.activeTexture(gl!.TEXTURE0);
  }

  function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    shaders.forEach((shader) => gl!.deleteShader(shader));
    programs.forEach((linked) => gl!.deleteProgram(linked));
    [sourceTexture, sceneTexture, frostTexture].forEach((made) => gl!.deleteTexture(made));
    gl!.deleteFramebuffer(sceneTarget);
    gl!.deleteFramebuffer(frostTarget);
    gl!.deleteBuffer(buffer);
    gl!.getExtension('WEBGL_lose_context')?.loseContext();
  }

  return { resize, setSource, setAurora, setDim, drawScene, drawGlass, destroy };
}
