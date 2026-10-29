import { useEffect, useState, useRef } from "react";
import { Linking, StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";
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
  const view = useRef<WebView<object>>(null);
  const current = useRef(payload);
  const [html] = useState(() => mapHtml(payload));
  const update = () =>
    view.current?.injectJavaScript(
      `window.__MOTOSALT_UPDATE__&&window.__MOTOSALT_UPDATE__(${JSON.stringify(current.current).replaceAll("<", "\\u003c")});true;`,
    );
  useEffect(() => {
    current.current = payload;
    update();
  }, [payload]);
  return (
    <View style={{ height, borderRadius: 14, overflow: "hidden" }}>
      <WebView<object>
        ref={view}
        source={{ html }}
        originWhitelist={["about:blank"]}
        javaScriptEnabled
        domStorageEnabled={false}
        mixedContentMode="never"
        userAgent="Motosalt/0.2 (+https://github.com/Pigeonhunt3r/motosalt)"
        style={styles.map}
        onLoadEnd={update}
        onMessage={(event) => {
          try {
            const message = JSON.parse(event.nativeEvent.data);
            if (
              message.source === "motosalt-map" &&
              message.type === "tap" &&
              validPoint(message.point)
            )
              onTap?.(message.point);
          } catch {}
        }}
        onShouldStartLoadWithRequest={(request) => {
          if (
            request.url === "about:blank" ||
            request.url.startsWith("about:srcdoc")
          )
            return true;
          if (request.url === "https://www.openstreetmap.org/copyright")
            void Linking.openURL(request.url);
          return false;
        }}
      />
    </View>
  );
}
const styles = StyleSheet.create({ map: { backgroundColor: "#e5eadc" } });
