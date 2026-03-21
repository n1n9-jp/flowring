import type {
  FlowringColors,
  FlowringDatum,
  FlowringInstance,
  FlowringOptions,
  FlowringSource,
  ProjectionFn,
} from "./types";
import { DEFAULT_COLORS, DEFAULT_OPTIONS, defaultFormatLabel } from "./defaults";
import { computeLayout } from "./layout";
import { renderToSvg, type RenderConfig } from "./render";
import { createBlinkTimer, getBlinkOpacity } from "./blink";

function resolveColors(
  colors?: FlowringColors,
): RenderConfig["colors"] {
  return {
    arc: colors?.arc ?? DEFAULT_COLORS.arc,
    stroke: colors?.stroke ?? DEFAULT_COLORS.stroke,
    buffer: colors?.buffer ?? DEFAULT_COLORS.buffer,
    dim: colors?.dim ?? DEFAULT_COLORS.dim,
    arcByRank: colors?.arcByRank,
  };
}

/**
 * Create a flowring instance.
 *
 * @param container - HTML element to insert the SVG into
 * @param options - Configuration (all optional, defaults provided)
 */
export function flowring(
  container: HTMLElement,
  options?: FlowringOptions,
): FlowringInstance {
  let opts: FlowringOptions = { ...options };
  let source: FlowringSource | undefined;
  let data: FlowringDatum[] = [];
  let blinkTime = 0;
  let destroyed = false;
  let lastWidth = 0;
  let lastHeight = 0;

  // Create SVG
  const svgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svgEl.style.width = "100%";
  svgEl.style.height = "100%";
  svgEl.style.position = "absolute";
  svgEl.style.inset = "0";
  svgEl.style.pointerEvents = "none";
  container.style.position ||= "relative";
  container.appendChild(svgEl);

  // ResizeObserver — only re-render when container size actually changes
  const resizeObserver = new ResizeObserver((entries) => {
    const entry = entries[0];
    if (!entry) return;
    const { width, height } = entry.contentRect;
    if (width === lastWidth && height === lastHeight) return;
    lastWidth = width;
    lastHeight = height;
    doRender();
  });
  resizeObserver.observe(container);

  // Blink timer
  const animate = opts.animate ?? DEFAULT_OPTIONS.animate;
  const blinkCount = opts.blinkCount ?? DEFAULT_OPTIONS.blinkCount;
  const blinkInterval = opts.blinkInterval ?? DEFAULT_OPTIONS.blinkInterval;

  const timer = animate
    ? createBlinkTimer({
        interval: blinkInterval,
        onTick: (elapsed) => {
          blinkTime = elapsed;
          doRender();
          // Fire onBlink callback
          if (opts.onBlink) {
            const opacities: number[] = [];
            for (let i = 0; i < blinkCount; i++) {
              opacities.push(getBlinkOpacity(elapsed, i));
            }
            opts.onBlink(opacities);
          }
        },
      })
    : null;

  timer?.start();

  function doRender() {
    if (destroyed || !source || data.length === 0) return;
    const rect = svgEl.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const topN = opts.topN ?? DEFAULT_OPTIONS.topN;
    const radiusFraction = opts.radiusFraction ?? DEFAULT_OPTIONS.radiusFraction;
    const projFn: ProjectionFn | undefined = opts.projection;

    const layout = computeLayout(
      source,
      data,
      topN,
      radiusFraction,
      projFn,
      { width: rect.width, height: rect.height },
      opts.total,
    );

    if (!layout) return;

    const renderConfig: RenderConfig = {
      direction: opts.direction ?? DEFAULT_OPTIONS.direction,
      colors: resolveColors(opts.colors),
      arcThickness: opts.arcThickness ?? DEFAULT_OPTIONS.arcThickness,
      animate: opts.animate ?? DEFAULT_OPTIONS.animate,
      blinkCount: opts.blinkCount ?? DEFAULT_OPTIONS.blinkCount,
      subtitle: opts.subtitle ?? DEFAULT_OPTIONS.subtitle,
      formatLabel: opts.formatLabel ?? defaultFormatLabel,
      formatTitle: opts.formatTitle,
    };

    renderToSvg(svgEl, layout, renderConfig, blinkTime);
    opts.onRender?.(blinkTime);
  }

  const instance: FlowringInstance = {
    update(s: FlowringSource, d: FlowringDatum[]) {
      source = s;
      data = d;
      timer?.reset();
      blinkTime = 0;
      doRender();
    },

    setOptions(newOpts: Partial<FlowringOptions>) {
      opts = { ...opts, ...newOpts };
      doRender();
    },

    render() {
      doRender();
    },

    renderAt(time: number) {
      blinkTime = time;
      doRender();
    },

    svg() {
      return destroyed ? null : svgEl;
    },

    resize() {
      doRender();
    },

    destroy() {
      destroyed = true;
      timer?.stop();
      resizeObserver.disconnect();
      svgEl.remove();
    },
  };

  return instance;
}
