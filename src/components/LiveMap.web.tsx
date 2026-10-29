import { useEffect, useState, useRef } from "react";
import { mapHtml } from "./mapHtml";
import type { MapPayload } from "./mapHtml";
import type { Point } from "../core/models";
import { validPoint } from "../core/models";
export default function LiveMap({
  payload,
  onTap,
  height = 330,
}: {
  payload: MapPayload;
  onTap?: (point: Point) => void;
  height?: number;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [html] = useState(() => mapHtml(payload));
  const update = () =>
    frame.current?.contentWindow?.postMessage({ type: "update", payload }, "*");
  useEffect(update, [payload]);
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return;
      try {
        const message =
          typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (
          message.source === "motosalt-map" &&
          message.type === "tap" &&
          validPoint(message.point)
        )
          onTap?.(message.point);
      } catch {}
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [onTap]);
  return (
    <iframe
      ref={frame}
      title="Interaktivt rutekort"
      srcDoc={html}
      onLoad={update}
      sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
      style={{
        width: "100%",
        height,
        border: 0,
        borderRadius: 14,
        background: "#e5eadc",
      }}
    />
  );
}
