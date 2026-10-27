precision highp float;
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
