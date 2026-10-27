precision highp float;
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
