// Başlık bandı: turuncu eş yükselti (kontur) çizgileri, WebGL2. Görünmezken durur; azaltılmış harekette tek kare.
const VS = `#version 300 es
in vec2 p; out vec2 uv;
void main() { uv = p * .5 + .5; gl_Position = vec4(p, 0., 1.); }`;

const FS = `#version 300 es
precision highp float;
in vec2 uv; out vec4 o;
uniform float t; uniform vec2 r;
float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float nz(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3. - 2. * f);
  return mix(mix(h(i), h(i + vec2(1, 0)), u.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0., a = .5;
  for (int k = 0; k < 5; k++) { v += a * nz(p); p = p * 2.03 + vec2(1.7, 9.2); a *= .5; }
  return v;
}
void main() {
  vec2 q = uv * vec2(r.x / r.y, 1.) * 1.35;
  float v = fbm(q + vec2(t * .016, -t * .009)) + .4 * fbm(q * .55 - vec2(t * .006, 0.));
  float k = v * 16.;
  float d = min(fract(k), 1. - fract(k));
  float cizgi = 1. - smoothstep(0., fwidth(k) * 1.15, d);
  float ana = mod(floor(k + .5), 5.) < .5 ? 1. : .42;          // her 5. eğri kalın: topoğrafik ana eğri
  float maske = smoothstep(.12, .62, uv.x) * (.55 + .45 * uv.y); // başlığın arkası sakin
  vec3 zemin = vec3(.071, .067, .063), turuncu = vec3(1., .416, .169);
  float tane = (h(gl_FragCoord.xy + fract(t) * 91.) - .5) * .03;
  o = vec4(mix(zemin, turuncu, cizgi * ana * maske * .7) + tane, 1.);
}`;

export function kontur(canvas) {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'low-power' });
  if (!gl) { canvas.hidden = true; return; }
  const derle = (tur, kod) => { const s = gl.createShader(tur); gl.shaderSource(s, kod); gl.compileShader(s); return s; };
  const pr = gl.createProgram();
  gl.attachShader(pr, derle(gl.VERTEX_SHADER, VS));
  gl.attachShader(pr, derle(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(pr);
  if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) { canvas.hidden = true; return; }
  gl.useProgram(pr);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const p = gl.getAttribLocation(pr, 'p');
  gl.enableVertexAttribArray(p);
  gl.vertexAttribPointer(p, 2, gl.FLOAT, false, 0, 0);
  const ut = gl.getUniformLocation(pr, 't'), ur = gl.getUniformLocation(pr, 'r');

  const sabit = matchMedia('(prefers-reduced-motion: reduce)');
  let gorunur = true, id = 0;
  const kareCiz = ms => {
    gl.uniform1f(ut, sabit.matches ? 40 : 40 + ms / 1000);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (!sabit.matches && gorunur) id = requestAnimationFrame(kareCiz);
  };
  const boyut = () => {
    const dpr = Math.min(devicePixelRatio, 1.5);
    canvas.width = Math.round(canvas.clientWidth * dpr);
    canvas.height = Math.round(canvas.clientHeight * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(ur, canvas.width, canvas.height);
    cancelAnimationFrame(id); kareCiz(performance.now());
  };
  new ResizeObserver(boyut).observe(canvas);
  new IntersectionObserver(([g]) => {
    gorunur = g.isIntersecting;
    cancelAnimationFrame(id);
    if (gorunur) kareCiz(performance.now());
  }).observe(canvas);
  sabit.addEventListener('change', boyut);
}
