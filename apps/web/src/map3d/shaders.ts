/**
 * shaders.ts - GLSL shaders for terrain vertex displacement and multi-layer draping.
 * 
 * Features:
 * - Manual bilinear height sampling (immune to WebGL float linear filtering limitations).
 * - Finite-difference normal calculation (Horn 3x3 equivalent F05).
 * - Slope computation in degrees mapped to Magma LUT.
 * - Elevation mapped to Cividis LUT.
 * - Dynamic hillshade from solar azimuth/elevation vector.
 * - Smooth opacity blending for elevation, slope, and hillshade overlays.
 */

export const terrainDisplacementVertexShader = `
  uniform sampler2D uHeightMap;
  uniform vec2 uHeightMapSize;
  uniform float uMinElevation;
  uniform float uMaxElevation;
  uniform float uExaggeration;

  varying vec2 vUv;
  varying float vElevation;
  varying vec3 vWorldPosition;

  // Manual bilinear texture sampler for float textures
  float sampleBilinear(sampler2D tex, vec2 uv, vec2 size) {
    vec2 coord = uv * size - 0.5;
    vec2 f = fract(coord);
    vec2 i = floor(coord);

    vec2 uv00 = (i + vec2(0.5, 0.5)) / size;
    vec2 uv10 = (i + vec2(1.5, 0.5)) / size;
    vec2 uv01 = (i + vec2(0.5, 1.5)) / size;
    vec2 uv11 = (i + vec2(1.5, 1.5)) / size;

    float h00 = texture2D(tex, uv00).r;
    float h10 = texture2D(tex, uv10).r;
    float h01 = texture2D(tex, uv01).r;
    float h11 = texture2D(tex, uv11).r;

    float h0 = mix(h00, h10, f.x);
    float h1 = mix(h01, h11, f.x);
    return mix(h0, h1, f.y);
  }

  void main() {
    vUv = uv;

    // Flip V coordinate so row 0 (North) aligns with scene -Z (North)
    vec2 sampleUv = vec2(uv.x, 1.0 - uv.y);
    float elev = sampleBilinear(uHeightMap, sampleUv, uHeightMapSize);
    vElevation = elev;

    // Displace along plane normal (+Z in local plane coords, before mesh rotation)
    vec3 displaced = position;
    displaced.z += (elev - uMinElevation) * uExaggeration;

    vec4 worldPos = modelMatrix * vec4(displaced, 1.0);
    vWorldPosition = worldPos.xyz;

    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

export const terrainDrapingFragmentShader = `
  uniform sampler2D uHeightMap;
  uniform vec2 uHeightMapSize;
  uniform sampler2D uCividisLut;
  uniform sampler2D uMagmaLut;
  uniform float uMinElevation;
  uniform float uMaxElevation;
  uniform float uExaggeration;
  uniform vec3 uSunDir;
  uniform vec2 uCellSize; // [dx, dy] in meters per cell

  // Layer opacities in [0, 1]
  uniform float uElevationOpacity;
  uniform float uSlopeOpacity;
  uniform float uHillshadeOpacity;
  uniform float uAmbient;

  varying vec2 vUv;
  varying float vElevation;
  varying vec3 vWorldPosition;

  // Manual bilinear texture sampler for gradient sampling
  float sampleBilinear(sampler2D tex, vec2 uv, vec2 size) {
    vec2 coord = uv * size - 0.5;
    vec2 f = fract(coord);
    vec2 i = floor(coord);

    vec2 uv00 = (i + vec2(0.5, 0.5)) / size;
    vec2 uv10 = (i + vec2(1.5, 0.5)) / size;
    vec2 uv01 = (i + vec2(0.5, 1.5)) / size;
    vec2 uv11 = (i + vec2(1.5, 1.5)) / size;

    float h00 = texture2D(tex, uv00).r;
    float h10 = texture2D(tex, uv10).r;
    float h01 = texture2D(tex, uv01).r;
    float h11 = texture2D(tex, uv11).r;

    float h0 = mix(h00, h10, f.x);
    float h1 = mix(h01, h11, f.x);
    return mix(h0, h1, f.y);
  }

  void main() {
    vec2 sampleUv = vec2(vUv.x, 1.0 - vUv.y);
    vec2 texel = 1.0 / uHeightMapSize;

    // Finite differences in East (X) and North (Y) directions
    float hE = sampleBilinear(uHeightMap, sampleUv + vec2(texel.x, 0.0), uHeightMapSize);
    float hW = sampleBilinear(uHeightMap, sampleUv - vec2(texel.x, 0.0), uHeightMapSize);
    float hN = sampleBilinear(uHeightMap, sampleUv - vec2(0.0, texel.y), uHeightMapSize); // North is -V
    float hS = sampleBilinear(uHeightMap, sampleUv + vec2(0.0, texel.y), uHeightMapSize); // South is +V

    float dzdx = (hE - hW) / (2.0 * max(1.0, uCellSize.x));
    float dzdz = (hS - hN) / (2.0 * max(1.0, uCellSize.y));

    // Surface normal vector in Three.js coordinates (+X=East, +Y=Up, -Z=North)
    vec3 normal = normalize(vec3(-dzdx * uExaggeration, 1.0, -dzdz * uExaggeration));

    // Slope calculation (degrees in [0, 90])
    float slopeGradient = sqrt(dzdx * dzdx + dzdz * dzdz);
    float slopeDeg = atan(slopeGradient) * 57.2957795; // 180 / PI
    float normSlope = clamp(slopeDeg / 35.0, 0.0, 1.0); // 35 deg maximum hazard slope

    // Elevation calculation (normalized in [0, 1])
    float elevRange = max(1.0, uMaxElevation - uMinElevation);
    float normElev = clamp((vElevation - uMinElevation) / elevRange, 0.0, 1.0);

    // Sample LUTs
    vec3 cividisColor = texture2D(uCividisLut, vec2(normElev, 0.5)).rgb;
    vec3 magmaColor = texture2D(uMagmaLut, vec2(normSlope, 0.5)).rgb;

    // Blend base colormaps according to layer opacities
    vec3 surfaceColor = cividisColor;
    if (uElevationOpacity < 1.0) {
      vec3 neutralRock = vec3(0.55, 0.48, 0.42); // Martian basaltic rock tone
      surfaceColor = mix(neutralRock, cividisColor, uElevationOpacity);
    }
    if (uSlopeOpacity > 0.0) {
      surfaceColor = mix(surfaceColor, magmaColor, uSlopeOpacity);
    }

    // Dynamic Hillshade from solar azimuth/elevation vector
    vec3 sun = normalize(uSunDir);
    float NdotL = max(dot(normal, sun), 0.0);
    float hillshade = uAmbient + (1.0 - uAmbient) * NdotL;

    // Apply Hillshade with configurable opacity
    vec3 shadedColor = mix(surfaceColor, surfaceColor * hillshade, uHillshadeOpacity);

    // Subtle atmospheric light bounce
    float skyBounce = max(normal.y, 0.0) * 0.05;
    shadedColor += skyBounce * vec3(0.65, 0.55, 0.50);

    gl_FragColor = vec4(shadedColor, 1.0);
  }
`;
