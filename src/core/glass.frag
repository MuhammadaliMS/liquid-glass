precision highp float;
// Every glass panel on the scene as a real solid of glass. Each panel is a rounded slab with
// a domed crown and rounded edges, ray-traced from a camera straight in front of it: light
// refracts into the slab, travels through it (bouncing inside when it can't get out), refracts
// out and lands on the backdrop behind. That's what makes the backdrop magnify, flip and
// smear at the rim. The same model as the liquid-glass playground's pebble.
// MAX_PANES is defined by the renderer from what the device's GPU allows.
uniform sampler2D u_scene;
uniform sampler2D u_frost;
uniform vec2 u_size;      // CSS pixels
uniform float u_dpr;
uniform int u_count;
uniform vec4 u_rect[MAX_PANES];    // centre x, centre y, half width, half height (CSS px)
uniform vec4 u_look[MAX_PANES];    // corner radius, frost 0..1, chroma, pointer pull (px)
uniform vec4 u_tint[MAX_PANES];    // rgb, strength
uniform vec4 u_profile[MAX_PANES]; // half depth, edge rounding, dome, index of refraction
uniform vec4 u_lens[MAX_PANES];    // a raised disc on the face: x, y (from centre), radius, amount
uniform vec4 u_extra[MAX_PANES];   // sound glow 0..1, shadow 0..1, press highlight 0..1, unused
uniform vec2 u_light;              // light position, CSS px
uniform vec2 u_pointer;            // pointer position, CSS px
uniform float u_bands[6];          // sound, low to high
uniform float u_level;

const float CAMERA = 780.0;
const float BACKGROUND = -190.0;

// The selected panel, copied out of the arrays (GLSL ES 1.0 can't index them by a variable).
vec4 R; vec4 L; vec4 T; vec4 P; vec4 N; vec4 X;
vec2 pointerLocal;

vec3 sceneColor(vec2 pixel, float frost) {
  vec2 uv = clamp(vec2(pixel.x / u_size.x, 1.0 - pixel.y / u_size.y), 0.001, 0.999);
  vec3 clear = pow(texture2D(u_scene, uv).rgb, vec3(2.2));
  vec3 blurred = pow(texture2D(u_frost, uv).rgb, vec3(2.2));
  return mix(clear, blurred, clamp(frost, 0.0, 1.0));
}

float box(vec2 p, vec2 halfSize, float radius) {
  vec2 q = abs(p) - halfSize + radius;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - radius;
}

// The panel's outline: its rounded rectangle, bulging a little toward a nearby pointer.
float outline(vec2 p) {
  float radius = min(L.x, min(R.z, R.w));
  float d = box(p, R.zw, radius);
  vec2 toPointer = p - pointerLocal;
  return d - L.w * exp(-dot(toPointer, toPointer) / 1800.0);
}

vec3 field(vec2 p) {
  float d = outline(p);
  vec2 e = vec2(0.5, 0.0);
  vec2 n = vec2(outline(p + e.xy) - outline(p - e.xy), outline(p + e.yx) - outline(p - e.yx));
  return vec3(d, normalize(n + 1e-6));
}

// Rounded extrusion with a smooth convex crown; the gradient belongs to the same solid.
vec4 solid(vec3 p) {
  vec3 boundary = field(p.xy);
  vec2 radius = max(R.zw, vec2(20.0));
  float dome = P.z * exp(-1.5 * dot(p.xy / radius, p.xy / radius));
  vec2 domeGradient = -3.0 * dome * p.xy / (radius * radius);
  float rounding = P.y;
  vec2 q = vec2(boundary.x + rounding, abs(p.z) - P.x - dome + rounding);
  vec2 outside = max(q, 0.0);
  float outsideLength = length(outside);
  vec2 weights = outsideLength > 0.0001 ? outside / outsideLength : (q.x > q.y ? vec2(1.0, 0.0) : vec2(0.0, 1.0));
  float distance = min(max(q.x, q.y), 0.0) + outsideLength - rounding;
  vec3 gradient = weights.x * vec3(boundary.yz, 0.0) + weights.y * vec3(-domeGradient, sign(p.z));
  if (N.w > 0.02) {
    vec2 delta = p.xy - N.xy;
    vec2 lensQ = vec2(length(delta) - N.z + 8.0, abs(p.z - P.x - 5.0) - 2.0);
    vec2 lensOutside = max(lensQ, 0.0);
    float lensLength = length(lensOutside);
    vec2 lensWeights = lensLength > 0.0001 ? lensOutside / lensLength : (lensQ.x > lensQ.y ? vec2(1.0, 0.0) : vec2(0.0, 1.0));
    float lensDistance = min(max(lensQ.x, lensQ.y), 0.0) + lensLength - 8.0;
    vec3 lensGradient = vec3(delta / max(length(delta), 0.001) * lensWeights.x, sign(p.z - P.x - 5.0) * lensWeights.y);
    float blend = clamp(0.5 + 0.5 * (distance - lensDistance) / 2.5, 0.0, 1.0) * N.w;
    distance = mix(distance, lensDistance, blend) - 2.5 * blend * (1.0 - blend);
    gradient = mix(gradient, lensGradient, blend);
  }
  return vec4(distance, gradient);
}

bool enterSolid(vec3 origin, vec3 direction, out vec3 hit) {
  vec3 bounds = vec3(R.zw + L.w + 6.0, P.x + P.z + 10.0);
  vec3 inverseRay = 1.0 / (direction + vec3(0.000001));
  vec3 a = (-bounds - origin) * inverseRay;
  vec3 b = (bounds - origin) * inverseRay;
  vec3 nearBox = min(a, b);
  vec3 farBox = max(a, b);
  float nearDistance = max(max(nearBox.x, nearBox.y), nearBox.z);
  float farDistance = min(min(farBox.x, farBox.y), farBox.z);
  float travel = max(0.0, nearDistance);
  if (farDistance < travel) return false;
  for (int i = 0; i < 56; i++) {
    hit = origin + direction * travel;
    float distance = solid(hit).x;
    if (distance < 0.12) return true;
    travel += max(0.06, distance * 0.74);
    if (travel > farDistance) break;
  }
  return false;
}

vec3 exitSolid(vec3 origin, vec3 direction, out float traveled) {
  float travel = 0.6;
  vec3 point = origin + direction * travel;
  float limit = 2.0 * (R.z + R.w) + 2.0 * P.x;
  for (int i = 0; i < 48; i++) {
    point = origin + direction * travel;
    float distance = -solid(point).x;
    if (i > 1 && distance < 0.12) break;
    travel += max(0.10, distance * 0.74);
    if (travel > limit) break;
  }
  traveled = travel;
  return point;
}

vec3 environment(vec3 direction, vec2 pixel) {
  vec2 reflectedPixel = u_size * 0.5 + direction.xy * u_size * 0.42;
  vec3 reflectedScene = sceneColor(reflectedPixel, 0.9);
  float softbox = exp(-pow((direction.x + 0.42) / 0.16, 2.0) - pow((direction.y + 0.58) / 0.28, 4.0));
  float fill = exp(-pow((direction.x - 0.7) / 0.10, 2.0) - pow(direction.y / 0.55, 4.0));
  return mix(reflectedScene, sceneColor(pixel, 0.65), 0.20) + vec3(0.96, 0.98, 1.0) * (softbox * 1.65 + fill * 0.32);
}

float energy(vec2 p, vec2 origin, vec2 spread) {
  vec2 d = (p - origin) / spread;
  return exp(-dot(d, d));
}

void main() {
  vec2 pixel = vec2(gl_FragCoord.x, u_size.y * u_dpr - gl_FragCoord.y) / u_dpr;
  vec3 base = sceneColor(pixel, 0.0);

  // Later panels sit on top (a knob on its track); outside every panel, the nearest one wins.
  float nearest = 1e5;
  float shade = 0.0;
  for (int i = 0; i < MAX_PANES; i++) {
    if (i >= u_count) break;
    vec4 r = u_rect[i];
    float radius = min(u_look[i].x, min(r.z, r.w));
    vec2 local = pixel - r.xy;
    float d = box(local, r.zw, radius) - u_look[i].w;
    float lift = min(r.w, 40.0);
    float s = box(local - vec2(2.0, lift * 0.22), r.zw, radius);
    shade = max(shade, (1.0 - smoothstep(-lift * 0.3, lift * 0.8, s)) * u_extra[i].y);
    bool take = d < 2.0 || (nearest >= 2.0 && d < nearest);
    if (take) { nearest = d; R = r; L = u_look[i]; T = u_tint[i]; P = u_profile[i]; N = u_lens[i]; X = u_extra[i]; }
  }
  vec3 outside = base * (1.0 - shade * 0.16);
  if (nearest > 2.0 || u_count == 0) { gl_FragColor = vec4(pow(outside, vec3(1.0 / 2.2)), 1.0); return; }

  vec2 local = pixel - R.xy;
  pointerLocal = u_pointer - R.xy;
  vec3 origin = vec3(0.0, 0.0, CAMERA);
  vec3 viewRay = normalize(vec3(local, -CAMERA));
  vec3 direction = viewRay;
  vec3 front;
  if (!enterSolid(origin, direction, front)) {
    float contact = (1.0 - smoothstep(-2.0, 13.0, outline(local - vec2(2.0, 7.0)))) * 0.045;
    gl_FragColor = vec4(pow(outside * (1.0 - contact), vec3(1.0 / 2.2)), 1.0);
    return;
  }
  vec3 normal = normalize(solid(front).yzw);
  float ior = P.w;
  vec3 inside = refract(direction, normal, 1.0 / ior);
  float pathLength;
  vec3 rear = exitSolid(front, inside, pathLength);
  vec3 rearNormal = normalize(solid(rear).yzw);
  vec3 outgoing = refract(inside, -rearNormal, ior);
  // Follow one internal bounce instead of a dark band where the first exit totally reflects.
  if (dot(outgoing, outgoing) < 0.01) {
    inside = reflect(inside, rearNormal);
    float secondLength;
    rear = exitSolid(rear, inside, secondLength);
    pathLength += secondLength;
    rearNormal = normalize(solid(rear).yzw);
    outgoing = refract(inside, -rearNormal, ior);
    if (dot(outgoing, outgoing) < 0.01) outgoing = reflect(inside, rearNormal);
  }
  vec3 reflected = environment(reflect(viewRay, normal), pixel);
  vec3 transmitted;
  float frost = L.y;
  if (outgoing.z < -0.045) {
    float distance = (BACKGROUND - rear.z) / outgoing.z;
    vec2 backgroundPoint = (rear.xy + outgoing.xy * distance) * CAMERA / (CAMERA - BACKGROUND);
    vec2 rayPixel = R.xy + backgroundPoint;
    vec2 displacement = clamp(rayPixel - pixel, vec2(-180.0), vec2(180.0));
    float grazing = 1.0 - max(dot(normal, -viewRay), 0.0);
    float filtering = clamp(grazing * grazing * 1.6 + length(displacement) / 300.0 + frost, 0.02, 0.92);
    float chroma = L.z;
    vec3 red = sceneColor(pixel + displacement * (1.0 - chroma), filtering);
    vec3 green = sceneColor(pixel + displacement, filtering);
    vec3 blue = sceneColor(pixel + displacement * (1.0 + chroma), filtering);
    transmitted = vec3(red.r, green.g, blue.b);
  } else transmitted = environment(outgoing, pixel);
  transmitted *= exp(-vec3(0.00032, 0.00015, 0.00007) * min(pathLength, 250.0));
  transmitted = mix(transmitted, pow(T.rgb, vec3(2.2)), T.a);

  float f0 = pow((ior - 1.0) / (ior + 1.0), 2.0);
  float fresnel = f0 + (1.0 - f0) * pow(1.0 - max(dot(normal, -viewRay), 0.0), 5.0);
  vec3 color = mix(transmitted, reflected, fresnel);
  vec3 toLight = normalize(vec3(u_light - R.xy - front.xy, 500.0));
  vec3 halfVector = normalize(toLight - viewRay);
  color += vec3(0.97, 0.985, 1.0) * pow(max(dot(normal, halfVector), 0.0), 160.0) * (0.04 + X.z * 0.10);
  color *= 1.0 + X.z * 0.06;

  // Sound lights the glass from inside in six colours, low notes left to high notes right.
  if (X.x > 0.001) {
    vec2 q = front.xy / max(R.zw, vec2(1.0));
    vec3 glow = vec3(1.0, 0.45, 0.10) * u_bands[0] * energy(q, vec2(-0.39, 0.53), vec2(0.26, 0.53));
    glow += vec3(1.0, 0.19, 0.08) * u_bands[1] * energy(q, vec2(-0.20, 0.64), vec2(0.24, 0.48));
    glow += vec3(1.0, 0.025, 0.30) * u_bands[2] * energy(q, vec2(0.03, 0.61), vec2(0.28, 0.52));
    glow += vec3(0.47, 0.04, 1.0) * u_bands[3] * energy(q, vec2(0.28, 0.55), vec2(0.26, 0.53));
    glow += vec3(0.08, 0.23, 1.0) * u_bands[4] * energy(q, vec2(0.52, 0.38), vec2(0.23, 0.52));
    glow += vec3(0.035, 0.75, 1.0) * u_bands[5] * energy(q, vec2(-0.64, 0.17), vec2(0.17, 0.53));
    color += glow * u_level * 0.75 * X.x;
  }
  if (N.w > 0.5 && length(front.xy - N.xy) < N.z - 2.0) color = mix(color, sceneColor(pixel, 0.85), 0.15);

  float coverage = clamp(0.5 - nearest * u_dpr, 0.0, 1.0);
  color = mix(outside, color, max(coverage, step(nearest, -1.0)));
  gl_FragColor = vec4(pow(max(color, vec3(0.0)), vec3(1.0 / 2.2)), 1.0);
}
