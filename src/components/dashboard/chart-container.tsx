import {
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

const DEFAULT_HEIGHT = 260;

type Props = {
  /** Renders once the container has a positive width (avoids Recharts measuring -1 in flex layouts). */
  children: (size: { width: number; height: number }) => ReactNode;
  height?: number;
  className?: string;
};

/**
 * Measures width with ResizeObserver and passes explicit pixel sizes to Recharts.
 * Avoids ResponsiveContainer width/height -1 warnings in sidebars / grid / hidden layouts.
 */
export function ChartContainer({
  children,
  height = DEFAULT_HEIGHT,
  className = "w-full min-w-0",
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(
    null,
  );

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    function measure() {
      const node = ref.current;
      if (!node) return;
      const w = Math.max(0, Math.floor(node.getBoundingClientRect().width));
      if (w > 0) {
        setSize({ width: w, height });
      }
    }

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [height]);

  return (
    <div
      ref={ref}
      className={className}
      style={{ height, minHeight: height }}
    >
      {size ? children(size) : null}
    </div>
  );
}
