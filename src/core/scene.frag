precision highp float;
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
