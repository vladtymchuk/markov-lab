"use client";

import { useEffect, useRef, useState } from "react";
import { init, use as registerEChartsModules } from "echarts/core";
import { LineChart } from "echarts/charts";
import { SVGRenderer } from "echarts/renderers";
import {
  GridComponent,
  LegendComponent,
  TooltipComponent,
} from "echarts/components";
import type { EChartsType } from "echarts/core";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Kind, Result } from "@/lib/api";

registerEChartsModules([
  LineChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  SVGRenderer,
]);

export function ReliabilityChart({
  result,
  kind,
  light,
  exportName,
}: {
  result: Result;
  kind: Kind;
  light: boolean;
  exportName?: string;
}) {
  const node = useRef<HTMLDivElement>(null);
  const chart = useRef<EChartsType | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!node.current) return;
    const plot = init(node.current, undefined, { renderer: "svg" });
    chart.current = plot;
    const observer = new ResizeObserver(() => plot.resize());
    observer.observe(node.current);
    return () => {
      observer.disconnect();
      plot.dispose();
      chart.current = null;
    };
  }, []);

  useEffect(() => {
    const colors = ["#4b9eff", "#32d5b0", "#fa798c", "#a393ff", "#f2b76f"];
    const text = light ? "#4e627e" : "#9badc6";
    const grid = light ? "#e3eaf3" : "#25354b";
    const metrics = [
      ["Надійність", "reliability"],
      ["Успіх", "success"],
      ["Відмова", "failure"],
      ["Виконання триває", "running"],
    ] as const;
    const series = [
      ...metrics.map(([name, key], index) => ({
        name,
        type: "line",
        showSymbol: result.series.length < 6,
        symbolSize: 5,
        data: result.series.map((row) => [row.time, row[key]]),
        lineStyle: { width: index === 0 ? 3 : 1.8 },
        ...(index === 0
          ? {
              areaStyle: {
                opacity: 0.13,
                color: {
                  type: "linear",
                  x: 0,
                  y: 0,
                  x2: 0,
                  y2: 1,
                  colorStops: [
                    { offset: 0, color: colors[0] },
                    { offset: 1, color: "transparent" },
                  ],
                },
              },
            }
          : {}),
      })),
    ];
    const passage = result.target
      ? [
          {
            name: "Перше досягнення",
            type: "line",
            showSymbol: false,
            data: result.series.map((row) => [
              row.time,
              row.first_passage ?? 0,
            ]),
            lineStyle: { width: 2, type: "dashed" },
          },
        ]
      : [];
    chart.current?.setOption(
      {
        animation: false,
        color: colors,
        textStyle: { fontFamily: "system-ui" },
        grid: { left: 48, right: 18, top: 15, bottom: 65 },
        legend: {
          type: "scroll",
          bottom: 0,
          textStyle: { color: text, fontSize: 11 },
          itemWidth: 14,
          itemHeight: 8,
        },
        tooltip: {
          trigger: "axis",
          renderMode: "richText",
          valueFormatter: (v: number) => (v * 100).toFixed(3) + "%",
        },
        xAxis: {
          type: "value",
          min: 0,
          minInterval: kind === "dtmc" ? 1 : 0,
          name: kind === "dtmc" ? "Крок, k" : "Час, t",
          nameLocation: "middle",
          nameGap: 28,
          nameTextStyle: { color: text },
          axisLabel: { color: text },
          axisLine: { lineStyle: { color: grid } },
          splitLine: { show: false },
        },
        yAxis: {
          type: "value",
          min: 0,
          max: 1,
          interval: 0.25,
          axisLabel: {
            color: text,
            formatter: (v: number) => Math.round(v * 100) + "%",
          },
          splitLine: { lineStyle: { color: grid, type: "dashed" } },
        },
        series: [...series, ...passage],
      },
      true,
    );
  }, [result, kind, light]);

  async function save(format: "png" | "svg") {
    if (!chart.current) return;
    setExporting(true);
    try {
      const uri = chart.current.getDataURL({
        type: "svg",
        backgroundColor: light ? "#ffffff" : "#101c2d",
      });
      const anchor = document.createElement("a");
      anchor.download = `${exportName}.${format}`;
      anchor.href = uri;
      if (format === "png") {
        const visual = new Image();
        visual.src = uri;
        await visual.decode();
        const canvas = document.createElement("canvas");
        canvas.width = visual.width * 2;
        canvas.height = visual.height * 2;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas unavailable");
        ctx.drawImage(visual, 0, 0, canvas.width, canvas.height);
        anchor.href = canvas.toDataURL("image/png");
      }
      anchor.click();
    } catch {
      toast.error("Не вдалося завантажити графік.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <div
        className="chart"
        ref={node}
        role="img"
        aria-label="Імовірності за горизонтом аналізу"
      />
      {exportName && (
        <div className="actions panel-foot">
          <Button disabled={exporting} onClick={() => void save("png")}>
            <Download size={15} />
            PNG
          </Button>
          <Button disabled={exporting} onClick={() => void save("svg")}>
            <Download size={15} />
            SVG
          </Button>
        </div>
      )}
    </>
  );
}
