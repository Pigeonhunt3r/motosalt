import Svg, { Circle, Path } from "react-native-svg";
import { Platform } from "react-native";

export type IconName =
  "arrow" | "plan" | "ride" | "group" | "data" | "sweeping" | "twisty" | "open";
const paths: Record<IconName, string> = {
  arrow: "M6 18 18 6M6 6h12v12",
  plan: "M5 20c0-7 14-2 14-9S5 8 5 2",
  ride: "m4 20 6-7-4-4 7-5 7 2-4 5 3 5-6 4",
  group: "M3 20v-2a4 4 0 0 1 4-4h3a4 4 0 0 1 4 4v2M16 14a4 4 0 0 1 5 4v2",
  data: "m12 3 8 9-8 9-8-9ZM12 8v5m0 3v.1",
  sweeping: "M3 20c0-10 18 2 18-9S3 11 3 2",
  twisty: "M5 22c-5-6 18-3 14-9S2 13 5 7s13 0 14-5",
  open: "M8 22 10 2m6 20L14 2M12 18v-4m0-4V6",
};
export default function Icon({
  name,
  color = "#71825a",
  size = 24,
}: {
  name: IconName;
  color?: string;
  size?: number;
}) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      accessible={Platform.OS === "web" ? undefined : false}
    >
      <Path
        d={paths[name]}
        stroke={color}
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {name === "group" && (
        <>
          <Circle
            cx={8.5}
            cy={6.5}
            r={3.5}
            stroke={color}
            strokeWidth={1.7}
            fill="none"
          />
          <Path
            d="M16 3a3.5 3.5 0 0 1 0 7"
            stroke={color}
            strokeWidth={1.7}
            fill="none"
          />
        </>
      )}
    </Svg>
  );
}
