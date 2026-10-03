import * as THREE from "three";
import {
  DEFAULT_WEATHER_PRESET_ID,
  getWeatherPreset,
  type WeatherPreset,
  type WeatherPresetId,
} from "./weather";

const vertexShader = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;

  uniform sampler2D uScene;
  uniform float uTime;
  uniform vec3 uTint;
  uniform float uBrightness;
  uniform float uContrast;
  uniform float uSaturation;
  uniform float uVignette;
  uniform float uCloudStrength;
  uniform vec3 uLightColor;
  uniform float uLightStrength;
  uniform vec2 uLightDirection;
  uniform float uMist;
  varying vec2 vUv;

  void main() {
    vec3 color = texture2D(uScene, vUv).rgb;

    float cloudWave =
      sin(vUv.x * 5.2 + vUv.y * 2.1 + uTime * 0.035)
      + sin(vUv.x * 2.3 - vUv.y * 4.7 - uTime * 0.022)
      + sin((vUv.x + vUv.y) * 8.1 + uTime * 0.016);
    cloudWave = cloudWave / 6.0 + 0.5;
    color *= 1.0 - uCloudStrength * (0.055 + cloudWave * 0.075);

    color *= uTint * uBrightness;
    float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
    color = mix(vec3(luminance), color, uSaturation);
    color = (color - 0.5) * uContrast + 0.5;

    vec2 centered = vUv - 0.5;
    float directionalLight = dot(centered, normalize(uLightDirection)) + 0.5;
    directionalLight = smoothstep(0.05, 0.95, directionalLight);
    color += uLightColor * directionalLight * uLightStrength;

    // Thin, moving banks cross the water; mist is spatial, not a flat tint.
    float bank = sin(vUv.y * 15.0 + sin(vUv.x * 5.0 + uTime * 0.025) * 2.0 - uTime * 0.035);
    float wisps = sin(vUv.x * 11.0 - vUv.y * 8.0 + uTime * 0.045) * 0.22;
    float fog = smoothstep(-0.45, 0.9, bank + wisps) * uMist;
    color = mix(color, vec3(0.64, 0.74, 0.69), fog);

    float edge = smoothstep(0.36, 0.76, length(centered * vec2(1.0, 1.3)));
    color *= 1.0 - edge * uVignette;
    gl_FragColor = vec4(max(color, vec3(0.0)), 1.0);
  }
`;

const scalarProperties = [
  "brightness",
  "contrast",
  "saturation",
  "vignette",
  "cloudStrength",
  "lightStrength",
  "wind", "mist", "glint", "shadowScale",
] as const;

export interface SurfaceWeather {
  wind: number;
  mist: number;
  glint: number;
  shadowScale: number;
  lightDirection: THREE.Vector2;
  lightColor: THREE.Color;
}

const surfaceWeather: Record<WeatherPresetId, readonly [number, number, number, number]> = {
  sunny: [0.22, 0, 0.055, 0.85], rain: [0.85, 0.015, 0.012, 0.6],
  "deep-clear": [0.12, 0, 0.035, 0.85], overcast: [0.45, 0.025, 0.008, 0.65],
  mist: [0.06, 0.17, 0.012, 0.55], sunset: [0.16, 0, 0.085, 1.4], moonlight: [0.09, 0, 0.075, 1.1],
};

interface WeatherState extends SurfaceWeather {
  tint: THREE.Color;
  lightColor: THREE.Color;
  lightDirection: THREE.Vector2;
  brightness: number;
  contrast: number;
  saturation: number;
  vignette: number;
  cloudStrength: number;
  lightStrength: number;
}

function stateFromPreset(preset: WeatherPreset): WeatherState {
  const [wind, mist, glint, shadowScale] = surfaceWeather[preset.id];
  return {
    wind, mist, glint, shadowScale,
    tint: new THREE.Color().setRGB(...preset.tint),
    lightColor: new THREE.Color().setRGB(...preset.lightColor),
    lightDirection: new THREE.Vector2(...preset.lightDirection),
    brightness: preset.brightness,
    contrast: preset.contrast,
    saturation: preset.saturation,
    vignette: preset.vignette,
    cloudStrength: preset.cloudStrength,
    lightStrength: preset.lightStrength,
  };
}

export class WeatherPass {
  public readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;

  private readonly material: THREE.ShaderMaterial;
  private readonly current = stateFromPreset(
    getWeatherPreset(DEFAULT_WEATHER_PRESET_ID),
  );
  private target = stateFromPreset(getWeatherPreset(DEFAULT_WEATHER_PRESET_ID));
  private previousTime = -1;
  public get surface(): Readonly<SurfaceWeather> { return this.current; }

  public constructor(sceneTexture: THREE.Texture) {
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uScene: { value: sceneTexture },
        uTime: { value: 0 },
        uTint: { value: this.current.tint },
        uBrightness: { value: this.current.brightness },
        uContrast: { value: this.current.contrast },
        uSaturation: { value: this.current.saturation },
        uVignette: { value: this.current.vignette },
        uCloudStrength: { value: this.current.cloudStrength },
        uLightColor: { value: this.current.lightColor },
        uLightStrength: { value: this.current.lightStrength },
        uLightDirection: { value: this.current.lightDirection },
        uMist: { value: this.current.mist },
      },
      vertexShader,
      fragmentShader,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.mesh.frustumCulled = false;
  }

  public setPreset(id: WeatherPresetId, immediate = false): void {
    this.target = stateFromPreset(getWeatherPreset(id));
    if (immediate) {
      this.current.tint.copy(this.target.tint);
      this.current.lightColor.copy(this.target.lightColor);
      this.current.lightDirection.copy(this.target.lightDirection);
      for (const property of scalarProperties) this.current[property] = this.target[property];
    }
  }

  public update(time: number): void {
    const deltaTime =
      this.previousTime < 0 ? 0 : Math.min(0.1, time - this.previousTime);
    this.previousTime = time;
    const blend = 1 - Math.exp(-deltaTime * 2.25);

    this.current.tint.lerp(this.target.tint, blend);
    this.current.lightColor.lerp(this.target.lightColor, blend);
    this.current.lightDirection.lerp(this.target.lightDirection, blend);
    for (const property of scalarProperties) {
      this.current[property] +=
        (this.target[property] - this.current[property]) * blend;
    }

    this.material.uniforms.uTime.value = time;
    this.material.uniforms.uBrightness.value = this.current.brightness;
    this.material.uniforms.uContrast.value = this.current.contrast;
    this.material.uniforms.uSaturation.value = this.current.saturation;
    this.material.uniforms.uVignette.value = this.current.vignette;
    this.material.uniforms.uCloudStrength.value = this.current.cloudStrength;
    this.material.uniforms.uLightStrength.value = this.current.lightStrength;
    this.material.uniforms.uMist.value = this.current.mist;
  }

  public dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
