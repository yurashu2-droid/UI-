/* Shared WebGL2 backdrop: a domain-warped noise field in the RAID OS 2025 palette with a cursor lens,
   an audio-reactive pulse, a faint dot matrix and film grain. Used by the title and the 2025 desktop. */
import { audio } from "./audio.js";

const FRAG = `#version 300 es
precision highp float;
uniform vec2 uRes; uniform float uTime; uniform vec2 uMouse; uniform float uPulse; uniform float uIn;
out vec4 o;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.-2.*f);
  return mix(mix(h(i), h(i+vec2(1,0)), u.x), mix(h(i+vec2(0,1)), h(i+1.), u.x), u.y); }
float fbm(vec2 p){ float v = 0., a = .5; for (int i = 0; i < 5; i++){ v += a*n(p); p = p*2.03 + vec2(1.7, 9.2); a *= .5; } return v; }
void main(){
  vec2 p = (gl_FragCoord.xy - .5*uRes) / uRes.y;
  vec2 m = (uMouse - .5) * vec2(uRes.x/uRes.y, 1.);
  float d = length(p - m);
  p -= (p - m) * .35 * exp(-d*d*6.);               // cursor lens
  float t = uTime * .07;
  vec2 q = vec2(fbm(p*1.5 + t), fbm(p*1.5 - t + 3.1));
  vec2 r = vec2(fbm(p*1.25 + q*2.4 + vec2(1.7, 9.2) + t*1.3), fbm(p*1.25 + q*2.4 + vec2(8.3, 2.8) - t));
  float f = fbm(p*1.05 + r*2.1);
  vec3 ink = vec3(.028, .027, .045), blue = vec3(.23, .21, 1.), orange = vec3(1., .31, .12), cream = vec3(.95, .92, .86);
  vec3 col = mix(ink, blue*.62, smoothstep(.28, .85, f));
  col = mix(col, orange, smoothstep(.6, 1., r.x*f*1.7) * .9);
  col += cream * pow(smoothstep(.55, 1., q.y*f*1.55), 3.) * .55;
  col *= 1. + uPulse*.45;
  col += orange * .12 * exp(-d*d*9.);             // warm spot under the cursor
  col *= smoothstep(1.6, .25, length(p*vec2(.78, 1.)));
  vec2 g = fract(gl_FragCoord.xy/5.) - .5;          // faint dot matrix: the screen is made of pixels
  col *= .88 + .12*smoothstep(.5, .15, length(g));
  col += (h(gl_FragCoord.xy + fract(uTime*7.)*91.) - .5) * .05;
  o = vec4(col * uIn, 1.);
}`;
export interface BackdropOptions {
  /** Fraction of CSS resolution to render at (the image is soft anyway). */
  scale?: number;
  /** Frame cap; the in-game wallpaper runs at 30 to stay light. */
  fps?: number;
  /** Overall brightness. */
  gain?: number;
}
export function shaderBackdrop(canvas: HTMLCanvasElement, signal: AbortSignal, still: boolean, opt: BackdropOptions = {}) {
  const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, powerPreference: "high-performance" });
  if (!gl) {
    canvas.classList.add("tt-gl-fallback");
    return { setMouse() {} };
  }
  const sh = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  };
  const prog = gl.createProgram()!;
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, "#version 300 es\nin vec2 a;void main(){gl_Position=vec4(a,0,1);}"));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    canvas.classList.add("tt-gl-fallback");
    return { setMouse() {} };
  }
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "a");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const U = (k: string) => gl.getUniformLocation(prog, k);
  const uRes = U("uRes"),
    uTime = U("uTime"),
    uMouse = U("uMouse"),
    uPulse = U("uPulse"),
    uIn = U("uIn");
  const SCALE = opt.scale ?? 0.55;
  const frameGap = 1000 / (opt.fps ?? 60) - 2;
  let lastDraw = 0;
  const resize = () => {
    canvas.width = Math.max(2, Math.round(canvas.clientWidth * SCALE));
    canvas.height = Math.max(2, Math.round(canvas.clientHeight * SCALE));
    gl.viewport(0, 0, canvas.width, canvas.height);
  };
  resize();
  window.addEventListener("resize", resize, { signal });
  const mouse = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 };
  let pulse = 0;
  const t0 = performance.now();
  const draw = (now: number) => {
    if (signal.aborted) return;
    if (!still && now - lastDraw < frameGap) {
      requestAnimationFrame(draw);
      return;
    }
    lastDraw = now;
    if (canvas.clientWidth && Math.abs(canvas.width - Math.round(canvas.clientWidth * SCALE)) > 2) resize();
    mouse.x += (mouse.tx - mouse.x) * 0.06;
    mouse.y += (mouse.ty - mouse.y) * 0.06;
    pulse += (audio.level().low - pulse) * 0.2;
    const t = (now - t0) / 1000;
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform1f(uTime, t + 20);
    gl.uniform2f(uMouse, mouse.x, 1 - mouse.y);
    gl.uniform1f(uPulse, pulse);
    gl.uniform1f(uIn, Math.min(1, t / 0.9) * (opt.gain ?? 1));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (!still) requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);
  signal.addEventListener("abort", () => gl.getExtension("WEBGL_lose_context")?.loseContext(), { once: true });
  return {
    setMouse(x: number, y: number) {
      mouse.tx = x;
      mouse.ty = y;
    },
  };
}


/** Run any full-screen fragment shader. `uniforms` is called every frame with the GL context and program. */
export function runFragment(
  canvas: HTMLCanvasElement,
  frag: string,
  uniforms: (gl: WebGL2RenderingContext, u: (name: string) => WebGLUniformLocation | null, t: number) => void,
  signal: AbortSignal,
  scale = 0.6,
): boolean {
  const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, powerPreference: "high-performance" });
  if (!gl) return false;
  const sh = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  };
  const prog = gl.createProgram()!;
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, "#version 300 es\nin vec2 a;void main(){gl_Position=vec4(a,0,1);}"));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, frag));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false;
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "a");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const cache = new Map<string, WebGLUniformLocation | null>();
  const u = (name: string) => {
    if (!cache.has(name)) cache.set(name, gl.getUniformLocation(prog, name));
    return cache.get(name)!;
  };
  const t0 = performance.now();
  const draw = (now: number) => {
    if (signal.aborted) return;
    const w = Math.max(2, Math.round(canvas.clientWidth * scale)),
      h = Math.max(2, Math.round(canvas.clientHeight * scale));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
    gl.uniform2f(u("uRes"), w, h);
    uniforms(gl, u, (now - t0) / 1000);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);
  signal.addEventListener("abort", () => gl.getExtension("WEBGL_lose_context")?.loseContext(), { once: true });
  return true;
}
