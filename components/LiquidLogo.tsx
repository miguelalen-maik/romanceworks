"use client";

import { useEffect, useRef } from "react";
import styles from "./LiquidLogo.module.css";

// Reference: https://github.com/tahabakri/webgl-fluid-lab
// Independent implementation: a small CPU wave field, GPU refraction of the
// original transparent SVG, and an on-demand loop (never autonomous ripples).
const SETTINGS = {
  brushPixels: 18,
  intensity: 0.22,
  velocityRetention: 0.94,
  refractionPixels: 14,
  maxDisplacementPixels: 3,
  settleThreshold: 0.00015,
  maxTailMs: 2400,
};

const VERTEX = `#version 300 es
in vec2 position;
out vec2 uv;
void main() {
  uv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}`;

const FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D logo;
uniform sampler2D field;
uniform vec2 cssSize;
uniform float refraction;
uniform float maxDisplacement;
in vec2 uv;
out vec4 color;

float heightAt(vec2 point) {
  ivec2 size = textureSize(field, 0);
  vec2 grid = clamp(point, 0.0, 1.0) * vec2(size - 1);
  ivec2 a = ivec2(floor(grid));
  ivec2 b = min(a + 1, size - 1);
  vec2 f = fract(grid);
  return mix(
    mix(texelFetch(field, a, 0).r, texelFetch(field, ivec2(b.x, a.y), 0).r, f.x),
    mix(texelFetch(field, ivec2(a.x, b.y), 0).r, texelFetch(field, b, 0).r, f.x),
    f.y
  );
}

void main() {
  vec2 cell = 1.0 / vec2(textureSize(field, 0) - 1);
  vec2 slope = vec2(
    heightAt(uv + vec2(cell.x, 0.0)) - heightAt(uv - vec2(cell.x, 0.0)),
    heightAt(uv + vec2(0.0, cell.y)) - heightAt(uv - vec2(0.0, cell.y))
  ) * 0.5;
  vec2 shift = clamp(slope * refraction, -maxDisplacement, maxDisplacement) / cssSize;
  vec2 sampleUV = uv + shift;
  if (any(lessThan(sampleUV, vec2(0.0))) || any(greaterThan(sampleUV, vec2(1.0)))) {
    color = vec4(0.0);
  } else {
    color = texture(logo, sampleUV);
  }
}`;

function createLiquid(stage: HTMLSpanElement, image: HTMLImageElement): () => void {
  const canvas = document.createElement("canvas");
  canvas.className = styles.surface;
  canvas.setAttribute("aria-hidden", "true");
  let context: WebGL2RenderingContext | null;
  try {
    context = canvas.getContext("webgl2", {
      alpha: true,
      antialias: false,
      premultipliedAlpha: true,
      powerPreference: "low-power",
    });
  } catch {
    return () => {};
  }
  if (!context) return () => {};
  const gl = context;

  let disposed = false;
  let failed = false;
  let visible = true;
  let ready = false;
  let validatedDraw = false;
  let frame = 0;
  let lastTime = 0;
  let lastInput = 0;
  let accumulator = 0;
  let width = 0;
  let height = 0;
  let columns = 0;
  let rows = 0;
  let heights = new Float32Array(0);
  let velocities = new Float32Array(0);
  let nextHeights = new Float32Array(0);
  let nextVelocities = new Float32Array(0);
  let previous: { x: number; y: number } | null = null;
  const shaders: WebGLShader[] = [];
  const textures: WebGLTexture[] = [];
  let program: WebGLProgram | null = null;
  let buffer: WebGLBuffer | null = null;
  let resizeObserver: ResizeObserver | undefined;
  let intersectionObserver: IntersectionObserver | undefined;

  const stop = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    lastTime = 0;
    accumulator = 0;
    previous = null;
    delete stage.dataset.liquidActive;
    heights.fill(0);
    velocities.fill(0);
  };
  const fail = () => {
    failed = true;
    stop();
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    stop();
    resizeObserver?.disconnect();
    intersectionObserver?.disconnect();
    stage.removeEventListener("pointermove", onPointerMove);
    stage.removeEventListener("pointerleave", onPointerLeave);
    image.removeEventListener("load", resize);
    image.removeEventListener("error", fail);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    canvas.removeEventListener("webglcontextlost", fail);
    textures.forEach((texture) => gl.deleteTexture(texture));
    shaders.forEach((shader) => gl.deleteShader(shader));
    gl.deleteProgram(program);
    gl.deleteBuffer(buffer);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    canvas.remove();
  };

  function onPointerLeave() {
    previous = null;
  }
  function onVisibilityChange() {
    if (document.hidden) stop();
  }

  // Moving input only: a stationary cursor never keeps adding energy.
  function onPointerMove(event: PointerEvent) {
    if (!ready || failed || !visible || document.hidden || event.pointerType !== "mouse") return;
    const rect = stage.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = rect.bottom - event.clientY;
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) return;
    const distance = previous ? Math.hypot(x - previous.x, y - previous.y) : 4;
    if (distance < 0.1) return;
    const steps = Math.min(8, Math.max(1, Math.ceil(distance / SETTINGS.brushPixels)));
    for (let step = 1; step <= steps; step++) {
      const blend = step / steps;
      const px = previous ? previous.x + (x - previous.x) * blend : x;
      const py = previous ? previous.y + (y - previous.y) * blend : y;
      const radius = SETTINGS.brushPixels;
      const cx = px / width * (columns - 1);
      const cy = py / height * (rows - 1);
      const rx = radius / width * (columns - 1);
      const ry = radius / height * (rows - 1);
      for (let gy = Math.max(1, Math.floor(cy - ry)); gy <= Math.min(rows - 2, Math.ceil(cy + ry)); gy++) {
        for (let gx = Math.max(1, Math.floor(cx - rx)); gx <= Math.min(columns - 2, Math.ceil(cx + rx)); gx++) {
          const squaredDistance = ((gx - cx) / rx) ** 2 + ((gy - cy) / ry) ** 2;
          if (squaredDistance >= 1) continue;
          const i = gy * columns + gx;
          const impulse = (1 - squaredDistance) ** 2 * SETTINGS.intensity * Math.min(distance / 12, 1) / steps;
          velocities[i] = Math.min(velocities[i] + impulse, 0.4);
        }
      }
    }
    previous = { x, y };
    lastInput = performance.now();
    if (!frame) {
      lastTime = lastInput - 1000 / 60;
      frame = requestAnimationFrame(tick);
    }
  }

  let fieldTexture: WebGLTexture;
  let logoTexture: WebGLTexture;
  let cssSize: WebGLUniformLocation | null;

  function resize() {
    stop();
    ready = false;
    if (disposed || failed || !image.complete || !image.naturalWidth) return;
    try {
      width = stage.clientWidth;
      height = stage.clientHeight;
      if (!width || !height) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      columns = Math.max(32, Math.min(256, Math.ceil(width / 5)));
      rows = Math.max(12, Math.min(64, Math.ceil(height / 5)));
      heights = new Float32Array(columns * rows);
      velocities = new Float32Array(columns * rows);
      nextHeights = new Float32Array(columns * rows);
      nextVelocities = new Float32Array(columns * rows);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, fieldTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, columns, rows, 0, gl.RED, gl.FLOAT, heights);

      // Rasterise the untouched SVG at the actual display density, never the page.
      const raster = document.createElement("canvas");
      raster.width = canvas.width;
      raster.height = canvas.height;
      const context = raster.getContext("2d");
      if (!context) throw new Error("No SVG raster context");
      context.drawImage(image, 0, 0, raster.width, raster.height);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, logoTexture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, raster);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.uniform2f(cssSize, width, height);
      gl.viewport(0, 0, canvas.width, canvas.height);
      if (gl.getError() !== gl.NO_ERROR) throw new Error("WebGL texture setup failed");
      ready = true;
      validatedDraw = false;
    } catch {
      fail();
    }
  }

  function simulate() {
    let energy = 0;
    for (let y = 1; y < rows - 1; y++) {
      for (let x = 1; x < columns - 1; x++) {
        const i = y * columns + x;
        const h = heights[i];
        const laplacian = heights[i - 1] + heights[i + 1] + heights[i - columns] + heights[i + columns] - 4 * h;
        const velocity = (velocities[i] + laplacian * 0.22) * SETTINGS.velocityRetention;
        const next = (h + velocity) * 0.995;
        nextVelocities[i] = velocity;
        nextHeights[i] = next;
        energy = Math.max(energy, Math.abs(next), Math.abs(velocity));
      }
    }
    [heights, nextHeights] = [nextHeights, heights];
    [velocities, nextVelocities] = [nextVelocities, velocities];
    return energy;
  }

  function tick(now: number) {
    frame = 0;
    if (disposed || failed || !ready || !visible || document.hidden) return stop();
    try {
      accumulator += Math.min((now - lastTime) / 1000, 0.04);
      lastTime = now;
      let energy = Infinity;
      while (accumulator >= 1 / 120) {
        energy = simulate();
        accumulator -= 1 / 120;
      }
      if (energy < SETTINGS.settleThreshold || now - lastInput > SETTINGS.maxTailMs) return stop();
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, fieldTexture);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, columns, rows, gl.RED, gl.FLOAT, heights);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      if (!validatedDraw) {
        if (gl.getError() !== gl.NO_ERROR) return fail();
        validatedDraw = true;
      }
      stage.dataset.liquidActive = "true";
      frame = requestAnimationFrame(tick);
    } catch {
      fail();
    }
  }

  try {
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) throw new Error("No WebGL shader");
      shaders.push(shader);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error("Shader compilation failed");
      return shader;
    };
    program = gl.createProgram();
    if (!program) throw new Error("No WebGL program");
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error("Shader linking failed");
    gl.useProgram(program);
    buffer = gl.createBuffer();
    if (!buffer) throw new Error("No WebGL buffer");
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    const texture = (unit: number, filter: number) => {
      const result = gl.createTexture();
      if (!result) throw new Error("No WebGL texture");
      textures.push(result);
      gl.activeTexture(unit);
      gl.bindTexture(gl.TEXTURE_2D, result);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return result;
    };
    logoTexture = texture(gl.TEXTURE0, gl.LINEAR);
    fieldTexture = texture(gl.TEXTURE1, gl.NEAREST);
    gl.uniform1i(gl.getUniformLocation(program, "logo"), 0);
    gl.uniform1i(gl.getUniformLocation(program, "field"), 1);
    gl.uniform1f(gl.getUniformLocation(program, "refraction"), SETTINGS.refractionPixels);
    gl.uniform1f(gl.getUniformLocation(program, "maxDisplacement"), SETTINGS.maxDisplacementPixels);
    cssSize = gl.getUniformLocation(program, "cssSize");

    stage.appendChild(canvas);
    canvas.addEventListener("webglcontextlost", fail);
    stage.addEventListener("pointermove", onPointerMove, { passive: true });
    stage.addEventListener("pointerleave", onPointerLeave);
    image.addEventListener("load", resize);
    image.addEventListener("error", fail);
    document.addEventListener("visibilitychange", onVisibilityChange);
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(stage);
    intersectionObserver = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (!visible) stop();
    });
    intersectionObserver.observe(stage);
    resize();
  } catch {
    dispose();
  }
  return dispose;
}

export default function LiquidLogo({ imageClassName }: { imageClassName: string }) {
  const stageRef = useRef<HTMLSpanElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const stage = stageRef.current;
    const image = imageRef.current;
    if (!stage || !image) return;
    const eligible = window.matchMedia("(hover: hover) and (pointer: fine) and (min-width: 48rem)");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let cleanup: (() => void) | undefined;
    const sync = () => {
      cleanup?.();
      cleanup = undefined;
      if (eligible.matches && !reducedMotion.matches) cleanup = createLiquid(stage, image);
    };
    sync();
    eligible.addEventListener("change", sync);
    reducedMotion.addEventListener("change", sync);
    return () => {
      eligible.removeEventListener("change", sync);
      reducedMotion.removeEventListener("change", sync);
      cleanup?.();
    };
  }, []);

  return (
    <span ref={stageRef} className={styles.stage}>
      <img
        ref={imageRef}
        src="/coming-soon/logo.svg"
        alt="ROMANCE"
        width={1240.13}
        height={217.023}
        className={imageClassName}
      />
    </span>
  );
}
