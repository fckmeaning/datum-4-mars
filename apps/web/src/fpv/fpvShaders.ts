/**
 * fpvShaders.ts - GLSL for the first-person view.
 *
 *  - Terrain: geometry clipmap (concentric rings, see fpvTerrain.ts). The height comes from the DEM texture with manual
 *    bilinear filtering (float textures are not guaranteed to be linearly filterable). The surface falls away by d^2/(2R)
 *    from the camera (F04), so the horizon sits where it does on a sphere of Mars' radius.
 *  - Shadows: soft shadow from the real sun direction by marching the height field (no shadow map needed).
 *  - Sky: one function shared by the dome and by the aerial perspective of the terrain and route ribbon.
 *
 * Scene axes: X East, Y up, Z = -North. Heights in the texture are (elevation - uBase) so float32 keeps sub-millimetre detail.
 */

/** Sky radiance for a view direction d and sun direction s (both unit vectors, scene axes). Display-referred colours. */
export const SKY_GLSL = /* glsl */ `
  vec3 fpvSky(vec3 d, vec3 s) {
    float day = smoothstep(-0.14, 0.18, s.y);
    float up = clamp(d.y, -0.15, 1.0);
    vec3 horizon = vec3(0.80, 0.61, 0.45);   // butterscotch dust haze
    vec3 zenith  = vec3(0.16, 0.22, 0.34);   // darker, bluer overhead
    float t = pow(clamp(up, 0.0, 1.0), 0.42);
    vec3 col = mix(horizon, zenith, t);
    float cs = max(dot(d, s), 0.0);
    // forward scattering by dust: the sky around the sun turns blue-grey (the Martian sunset effect)
    col = mix(col, vec3(0.50, 0.60, 0.74), pow(cs, 14.0) * 0.55 * day);
    // low sun: warm band along the horizon on the sun's side
    float twi = (1.0 - smoothstep(0.0, 0.35, abs(s.y))) * pow(cs, 2.0) * (1.0 - t);
    col += vec3(0.30, 0.16, 0.08) * twi * 0.5;
    col = mix(col, horizon * 0.55, smoothstep(0.0, -0.15, d.y) * 0.6);
    return col * mix(0.035, 1.0, day);
  }
  vec3 fpvSoftClip(vec3 c) { return c / (1.0 + max(c - 1.0, 0.0)); }
`;

/** Height-field access shared by the vertex and fragment stages. */
const DEM_GLSL = /* glsl */ `
  uniform sampler2D uHeight;
  uniform vec4 uBBox;      // minX, minY, maxX, maxY (AOI metres)
  uniform vec2 uTexSize;   // raster width, height in pixels
  uniform float uBase;     // elevation subtracted before upload [m]

  // world = (scene X, scene Z); AOI y = -Z. Pixel centres sit at (index + 0.5), row 0 is North.
  float demAt(vec2 world) {
    vec2 aoi = vec2(world.x, -world.y);
    float col = (aoi.x - uBBox.x) / (uBBox.z - uBBox.x) * uTexSize.x - 0.5;
    float row = (uBBox.w - aoi.y) / (uBBox.w - uBBox.y) * uTexSize.y - 0.5;
    col = clamp(col, 0.0, uTexSize.x - 1.0);
    row = clamp(row, 0.0, uTexSize.y - 1.0);
    float c0 = floor(col);
    float r0 = floor(row);
    vec2 f = vec2(col - c0, row - r0);
    vec2 inv = 1.0 / uTexSize;
    float h00 = texture2D(uHeight, (vec2(c0, r0) + 0.5) * inv).r;
    float h10 = texture2D(uHeight, (vec2(c0 + 1.0, r0) + 0.5) * inv).r;
    float h01 = texture2D(uHeight, (vec2(c0, r0 + 1.0) + 0.5) * inv).r;
    float h11 = texture2D(uHeight, (vec2(c0 + 1.0, r0 + 1.0) + 0.5) * inv).r;
    return mix(mix(h00, h10, f.x), mix(h01, h11, f.x), f.y);
  }

  float outsideAoi(vec2 world) {
    vec2 aoi = vec2(world.x, -world.y);
    return (aoi.x < uBBox.x || aoi.x > uBBox.z || aoi.y < uBBox.y || aoi.y > uBBox.w) ? 1.0 : 0.0;
  }
`;

export const terrainVertexShader = /* glsl */ `
  ${DEM_GLSL}
  uniform vec2 uCam;       // camera (scene X, scene Z)
  uniform vec2 uOffset;    // snapped centre of this ring (scene X, scene Z)
  uniform float uCell;     // ring cell size [m]
  uniform float uHalf;     // ring half extent [m]
  uniform float uCurv;     // 1 / (2 R)
  attribute vec2 aOdd;     // 1 on vertices that do not exist in the next coarser ring
  varying vec3 vWorld;
  varying float vH;        // height above uBase, before curvature
  varying float vOut;

  void main() {
    vec2 local = position.xz;
    vec2 world = local + uOffset;
    float h = demAt(world);

    // geomorph the outer band towards the coarser ring so neighbouring rings meet without cracks
    float edge = max(abs(local.x), abs(local.y)) / uHalf;
    float m = smoothstep(0.78, 0.98, edge);
    if (m > 0.0 && (aOdd.x > 0.5 || aOdd.y > 0.5)) {
      vec2 a = vec2(aOdd.x * uCell, 0.0);
      vec2 b = vec2(0.0, aOdd.y * uCell);
      float hc;
      if (aOdd.x > 0.5 && aOdd.y > 0.5) {
        hc = 0.25 * (demAt(world + a + b) + demAt(world + a - b) + demAt(world - a + b) + demAt(world - a - b));
      } else {
        hc = 0.5 * (demAt(world + a + b) + demAt(world - a - b));
      }
      h = mix(h, hc, m);
    }

    vec2 d = world - uCam;
    float drop = dot(d, d) * uCurv;   // F04: d^2 / (2R)
    vH = h;
    vOut = outsideAoi(world);
    vWorld = vec3(world.x, h - drop, world.y);
    gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
  }
`;

export const terrainFragmentShader = /* glsl */ `
  ${DEM_GLSL}
  ${SKY_GLSL}
  uniform vec3 uCamPos;
  uniform vec3 uSunDir;
  uniform float uDemCell;    // DEM pixel size [m]
  uniform float uFogDist;    // aerial perspective length [m]
  uniform int uShadowSteps;
  varying vec3 vWorld;
  varying float vH;
  varying float vOut;

  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash12(i), hash12(i + vec2(1, 0)), f.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), f.x), f.y);
  }

  float softShadow(vec2 xz, float h0, vec3 sun) {
    if (sun.y <= 0.0) return 0.0;
    float res = 1.0;
    float t = 3.0;
    for (int i = 0; i < 40; i++) {
      if (i >= uShadowSteps) break;
      float rayY = h0 + 0.4 + sun.y * t;              // height of the ray towards the sun above uBase
      float h = demAt(xz + sun.xz * t);               // terrain under the ray
      res = min(res, 9.0 * (rayY - h) / t);           // penumbra from the clearance-to-distance ratio
      if (res < 0.0) break;
      t *= 1.26;
    }
    return clamp(res, 0.0, 1.0);
  }

  void main() {
    vec3 V = vWorld - uCamPos;
    float dist = length(V);
    vec3 vdir = V / max(dist, 1e-3);
    vec2 xz = vWorld.xz;

    // surface normal from the DEM (central differences over one DEM pixel or more)
    float e = max(uDemCell, 0.5 * dist * 0.01 + 1.0);
    float hxm = demAt(xz - vec2(e, 0.0));
    float hxp = demAt(xz + vec2(e, 0.0));
    float hzm = demAt(xz - vec2(0.0, e));
    float hzp = demAt(xz + vec2(0.0, e));
    vec3 n = normalize(vec3(hxm - hxp, 2.0 * e, hzm - hzp));

    // fine grain that the 10 m DEM cannot resolve: display only, fades out with distance
    float near = 1.0 - smoothstep(60.0, 420.0, dist);
    float g1 = vnoise(xz * 3.3);
    float g2 = vnoise(xz * 13.0 + 11.0);
    float g3 = vnoise(xz * 0.21 + 5.0);
    vec2 gradN = vec2(vnoise(xz * 3.3 + vec2(0.2, 0.0)) - g1, vnoise(xz * 3.3 + vec2(0.0, 0.2)) - g1);
    n = normalize(n + near * vec3(-gradN.x, 0.0, -gradN.y) * 0.55 + near * (g2 - 0.5) * vec3(0.16, 0.0, 0.11));

    vec3 sun = normalize(uSunDir);
    float ndl = max(dot(n, sun), 0.0);
    float sh = softShadow(xz, vH, sun);

    // albedo: natural brown regolith (same hue as the map's imagery basemap), dust patches and grain
    vec3 regolith = vec3(0.64, 0.44, 0.31);
    float dust = smoothstep(0.35, 0.8, g3);
    regolith = mix(regolith, vec3(0.72, 0.53, 0.39), dust * 0.55);
    vec3 albedo = regolith;
    albedo *= 0.90 + 0.20 * mix(0.5, g1 * 0.45 + g2 * 0.55, near);

    float day = smoothstep(-0.14, 0.18, sun.y);
    vec3 sunCol = vec3(1.0, 0.93, 0.82) * 1.25;
    vec3 sky = fpvSky(normalize(vec3(n.x, max(n.y, 0.2), n.z)), sun);
    // sky fill plus a small constant bounce from the lit ground, so shadowed slopes stay readable instead of black
    vec3 amb = (sky * 0.95 + vec3(0.11, 0.09, 0.075)) * (0.55 + 0.45 * n.y) * (0.40 + 0.60 * day);
    vec3 col = albedo * (sunCol * ndl * sh * day + amb);

    // aerial perspective with the sky colour in the viewing direction (the AOI edge dissolves into the haze)
    float fog = 1.0 - exp(-pow(dist / uFogDist, 1.15));
    fog = max(fog, vOut * 0.94);
    vec3 fogCol = fpvSky(normalize(vec3(vdir.x, max(vdir.y, 0.0), vdir.z)), sun);
    col = mix(col, fogCol, clamp(fog, 0.0, 1.0));

    col = fpvSoftClip(col);
    col += (hash12(gl_FragCoord.xy) - 0.5) / 255.0;   // dither against banding in the haze
    gl_FragColor = vec4(col, 1.0);
  }
`;

export const skyVertexShader = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const skyFragmentShader = /* glsl */ `
  ${SKY_GLSL}
  uniform vec3 uSunDir;
  varying vec3 vDir;
  void main() {
    vec3 d = normalize(vDir);
    vec3 s = normalize(uSunDir);
    vec3 col = fpvSky(d, s);
    float cs = dot(d, s);
    float day = smoothstep(-0.14, 0.18, s.y);
    // the Sun from Mars subtends about 0.35 deg; a small halo from dust, nothing cartoonish
    float disc = smoothstep(cos(radians(0.26)), cos(radians(0.20)), cs);
    float halo = pow(max(cs, 0.0), 900.0) * 0.55 + pow(max(cs, 0.0), 70.0) * 0.10;
    col += vec3(1.0, 0.95, 0.85) * (disc * 7.0 + halo) * step(-0.02, d.y) * smoothstep(-0.05, 0.02, s.y);
    col = fpvSoftClip(col);
    gl_FragColor = vec4(col, 1.0);
  }
`;

/** Route ribbon: vertex colours by limiting factor, same curvature drop and haze as the terrain. */
export const ribbonVertexShader = /* glsl */ `
  uniform vec2 uCam;
  uniform float uCurv;
  varying vec3 vColor;
  varying vec3 vWorld;
  void main() {
    vColor = color;
    vec2 d = position.xz - uCam;
    vec3 p = vec3(position.x, position.y - dot(d, d) * uCurv, position.z);
    vWorld = p;
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }
`;

export const ribbonFragmentShader = /* glsl */ `
  ${SKY_GLSL}
  uniform vec3 uCamPos;
  uniform vec3 uSunDir;
  uniform float uFogDist;
  varying vec3 vColor;
  varying vec3 vWorld;
  void main() {
    vec3 V = vWorld - uCamPos;
    float dist = length(V);
    vec3 vdir = V / max(dist, 1e-3);
    vec3 sun = normalize(uSunDir);
    float day = smoothstep(-0.14, 0.18, sun.y);
    vec3 col = vColor * (0.55 + 0.45 * day);
    float fog = 1.0 - exp(-pow(dist / uFogDist, 1.15));
    col = mix(col, fpvSky(normalize(vec3(vdir.x, max(vdir.y, 0.0), vdir.z)), sun), clamp(fog, 0.0, 1.0));
    // fade out right at the feet so the ribbon does not fill the lower third of the view
    float nearFade = smoothstep(3.0, 16.0, dist);
    gl_FragColor = vec4(fpvSoftClip(col), 0.9 * nearFade);
  }
`;
