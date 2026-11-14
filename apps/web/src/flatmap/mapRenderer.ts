/**
 * Draws the raster of the flat map: the colour mosaic with the data layers composited over it, for any centre and scale.
 *
 * WebGL2 does it per pixel with the same blend as the globe shader (each layer multiplies the colour below it by 0.45 + 1.1
 * times its brightness), so a layer looks the same on the globe and on the map. Without WebGL2 (old devices, tests) a canvas
 * 2D fallback draws the mosaic and a plain alpha blend of the layers.
 */
import { COMPOSITE_ORDER, type CompositeLayerId } from "../globe/globeAssets";
import type { MapSize, MapView } from "./projection";

export type LayerWeights = Partial<Record<CompositeLayerId, number>>;

export interface MapRenderer {
  readonly kind: "webgl" | "canvas";
  setMosaic(img: HTMLImageElement): void;
  setLayer(id: CompositeLayerId, img: HTMLImageElement | null): void;
  setWeights(w: LayerWeights): void;
  /** Draws one frame. `size` is in CSS px, `dpr` the device pixel ratio the canvas was sized with. */
  draw(view: MapView, size: MapSize, dpr: number): void;
  readonly hasMosaic: boolean;
  dispose(): void;
}

const N = COMPOSITE_ORDER.length;

const VERT = `#version 300 es
void main() {
  // one triangle that covers the whole canvas
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform vec2 uCenter;
uniform float uScale;
uniform sampler2D uBase;
uniform float uHasBase;
${COMPOSITE_ORDER.map((_, i) => `uniform sampler2D uL${i};\nuniform float uW${i};`).join("\n")}
out vec4 outColor;

void main() {
  vec2 p = gl_FragCoord.xy - 0.5 * uRes;
  float lon = uCenter.x + p.x / uScale;
  float lat = uCenter.y + p.y / uScale;
  if (abs(lat) > 90.0) {
    outColor = vec4(0.0);
    return;
  }
  // continuous coordinate for the derivatives, wrapped one for the lookup: no seam line at +-180
  vec2 c = vec2(lon / 360.0 + 0.5, (lat + 90.0) / 180.0);
  vec2 uv = vec2(fract(c.x), c.y);
  vec2 dx = dFdx(c);
  vec2 dy = dFdy(c);
  vec3 col = uHasBase > 0.5 ? textureGrad(uBase, uv, dx, dy).rgb : vec3(0.34, 0.2, 0.15);
${COMPOSITE_ORDER.map(
  (_, i) => `  if (uW${i} > 0.0) {
    vec3 o${i} = textureGrad(uL${i}, uv, dx, dy).rgb;
    float l${i} = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(col, o${i} * (0.45 + 1.1 * l${i}), uW${i} * 0.85);
  }`,
).join("\n")}
  col = pow(col, vec3(0.88)) * 1.12;
  float edge = clamp((90.0 - abs(lat)) * uScale, 0.0, 1.0);
  outColor = vec4(col * edge, edge);
}`;

function createWebGLRenderer(canvas: HTMLCanvasElement): MapRenderer | null {
  const gl = canvas.getContext("webgl2", { alpha: true, antialias: false, premultipliedAlpha: true }) as WebGL2RenderingContext | null;
  if (!gl || typeof gl.createProgram !== "function") return null;

  let program: WebGLProgram | null = null;
  let uniforms: Record<string, WebGLUniformLocation | null> = {};
  let baseTex: WebGLTexture | null = null;
  let layerTex: Array<WebGLTexture | null> = new Array(N).fill(null);
  let baseImg: HTMLImageElement | null = null;
  const layerImg: Array<HTMLImageElement | null> = new Array(N).fill(null);
  let weights = new Array<number>(N).fill(0);
  let lost = false;
  let aniso: { ext: EXT_texture_filter_anisotropic; max: number } | null = null;

  function compile(type: number, src: string): WebGLShader | null {
    const s = gl!.createShader(type);
    if (!s) return null;
    gl!.shaderSource(s, src);
    gl!.compileShader(s);
    if (!gl!.getShaderParameter(s, gl!.COMPILE_STATUS)) {
      gl!.deleteShader(s);
      return null;
    }
    return s;
  }

  function build(): boolean {
    const vs = compile(gl!.VERTEX_SHADER, VERT);
    const fs = compile(gl!.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return false;
    const prog = gl!.createProgram();
    if (!prog) return false;
    gl!.attachShader(prog, vs);
    gl!.attachShader(prog, fs);
    gl!.linkProgram(prog);
    if (!gl!.getProgramParameter(prog, gl!.LINK_STATUS)) return false;
    program = prog;
    const names = ["uRes", "uCenter", "uScale", "uBase", "uHasBase", ...COMPOSITE_ORDER.flatMap((_, i) => [`uL${i}`, `uW${i}`])];
    uniforms = {};
    for (const n of names) uniforms[n] = gl!.getUniformLocation(prog, n);
    const ext = gl!.getExtension("EXT_texture_filter_anisotropic");
    aniso = ext ? { ext, max: Number(gl!.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT)) || 1 } : null;
    return true;
  }

  function upload(img: HTMLImageElement): WebGLTexture | null {
    const tex = gl!.createTexture();
    if (!tex) return null;
    gl!.bindTexture(gl!.TEXTURE_2D, tex);
    gl!.pixelStorei(gl!.UNPACK_FLIP_Y_WEBGL, true);
    gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA, gl!.RGBA, gl!.UNSIGNED_BYTE, img);
    gl!.generateMipmap(gl!.TEXTURE_2D);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.REPEAT);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.LINEAR_MIPMAP_LINEAR);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.LINEAR);
    if (aniso) gl!.texParameterf(gl!.TEXTURE_2D, aniso.ext.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, aniso.max));
    return tex;
  }

  if (!build()) return null;

  const onLost = (e: Event) => {
    e.preventDefault();
    lost = true;
  };
  const onRestored = () => {
    lost = false;
    baseTex = null;
    layerTex = new Array(N).fill(null);
    if (!build()) return;
    if (baseImg) baseTex = upload(baseImg);
    layerImg.forEach((img, i) => {
      if (img) layerTex[i] = upload(img);
    });
  };
  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", onRestored);

  return {
    kind: "webgl",
    get hasMosaic() {
      return baseTex !== null;
    },
    setMosaic(img) {
      if (baseTex) gl.deleteTexture(baseTex);
      baseImg = img;
      baseTex = lost ? null : upload(img);
    },
    setLayer(id, img) {
      const i = COMPOSITE_ORDER.indexOf(id);
      if (i < 0) return;
      const old = layerTex[i];
      if (old) gl.deleteTexture(old);
      layerImg[i] = img;
      layerTex[i] = img && !lost ? upload(img) : null;
    },
    setWeights(w) {
      weights = COMPOSITE_ORDER.map((id) => Math.max(0, Math.min(1, w[id] ?? 0)));
    },
    draw(view, size, dpr) {
      if (lost || !program) return;
      const wpx = Math.max(1, Math.round(size.w * dpr));
      const hpx = Math.max(1, Math.round(size.h * dpr));
      if (canvas.width !== wpx || canvas.height !== hpx) {
        canvas.width = wpx;
        canvas.height = hpx;
      }
      gl.viewport(0, 0, wpx, hpx);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);
      gl.uniform2f(uniforms["uRes"]!, wpx, hpx);
      gl.uniform2f(uniforms["uCenter"]!, view.lon, view.lat);
      gl.uniform1f(uniforms["uScale"]!, view.scale * dpr);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, baseTex);
      gl.uniform1i(uniforms["uBase"]!, 0);
      gl.uniform1f(uniforms["uHasBase"]!, baseTex ? 1 : 0);
      for (let i = 0; i < N; i++) {
        const unit = i + 1;
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, layerTex[i] ?? baseTex);
        gl.uniform1i(uniforms[`uL${i}`]!, unit);
        gl.uniform1f(uniforms[`uW${i}`]!, layerTex[i] ? (weights[i] ?? 0) : 0);
      }
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    dispose() {
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      if (baseTex) gl.deleteTexture(baseTex);
      for (const t of layerTex) if (t) gl.deleteTexture(t);
      if (program) gl.deleteProgram(program);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}

function createCanvasRenderer(canvas: HTMLCanvasElement): MapRenderer {
  const ctx = canvas.getContext("2d");
  let base: HTMLImageElement | null = null;
  const layers: Array<HTMLImageElement | null> = new Array(N).fill(null);
  let weights = new Array<number>(N).fill(0);
  return {
    kind: "canvas",
    get hasMosaic() {
      return base !== null;
    },
    setMosaic(img) {
      base = img;
    },
    setLayer(id, img) {
      const i = COMPOSITE_ORDER.indexOf(id);
      if (i >= 0) layers[i] = img;
    },
    setWeights(w) {
      weights = COMPOSITE_ORDER.map((id) => Math.max(0, Math.min(1, w[id] ?? 0)));
    },
    draw(view, size, dpr) {
      if (!ctx) return;
      const wpx = Math.max(1, Math.round(size.w * dpr));
      const hpx = Math.max(1, Math.round(size.h * dpr));
      if (canvas.width !== wpx || canvas.height !== hpx) {
        canvas.width = wpx;
        canvas.height = hpx;
      }
      ctx.clearRect(0, 0, wpx, hpx);
      const s = view.scale * dpr;
      const top = hpx / 2 - (90 - view.lat) * s;
      const worldW = 360 * s;
      // x of the western edge of the world copy that holds the centre (view.lon is in [-180, 180))
      const left0 = wpx / 2 + (-180 - view.lon) * s;
      const copies = [left0 - worldW, left0, left0 + worldW];
      const paint = (img: HTMLImageElement, alpha: number) => {
        ctx.globalAlpha = alpha;
        for (const x of copies) ctx.drawImage(img, x, top, worldW, 180 * s);
      };
      if (base) paint(base, 1);
      layers.forEach((img, i) => {
        if (img && (weights[i] ?? 0) > 0) paint(img, (weights[i] ?? 0) * 0.85);
      });
      ctx.globalAlpha = 1;
    },
    dispose() {
      base = null;
    },
  };
}

/**
 * WebGL2 if the device has it (and compiles our shader), the canvas 2D fallback otherwise. The renderer makes its own
 * canvas (a canvas that gave a webgl2 context can never give a 2d one); the caller puts `canvas` in the page.
 */
export function createMapRenderer(): MapRenderer & { canvas: HTMLCanvasElement } {
  try {
    const canvas = document.createElement("canvas");
    const gl = createWebGLRenderer(canvas);
    if (gl) return Object.assign(gl, { canvas });
  } catch {
    /* fall through */
  }
  const canvas = document.createElement("canvas");
  return Object.assign(createCanvasRenderer(canvas), { canvas });
}
