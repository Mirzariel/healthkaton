import type { ReactNode } from "react";

/** The browser scales a fixed HTML viewport through SVG, including before hydration. */
export function PreviewViewport({ width, height, children }: { width: number; height: number; children: ReactNode }) {
  return (
    <svg
      data-preview-viewport={`${width}x${height}`}
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className="block h-auto w-full"
      aria-hidden="true"
      focusable="false"
    >
      <foreignObject width={width} height={height}>
        <div data-preview-content style={{ width, height }}>
          {children}
        </div>
      </foreignObject>
    </svg>
  );
}
