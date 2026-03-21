import { tool, text } from "../bot-tool";
import { fetchActiveNotice, db, PARKING_URL } from "../snow";

export const snowEmergencyTool = tool({
  name: "get_snow_emergency",
  description: text`
    Get the current Minneapolis snow emergency status.
    Returns whether a snow emergency is in effect, what phase/rules apply,
    and when it expires. Use this when someone asks about snow emergencies,
    parking rules during snow, or whether they need to move their car.
  `,
  parameters: {},
  implementation: async () => {
    const active = await fetchActiveNotice();

    if (!active) {
      return { status: "unknown", message: "Could not retrieve snow emergency data." };
    }

    return {
      status: active.noticetype === "warning" ? "active" : "none",
      message: active.text,
      publishDate: active.publishDate,
      expireDate: active.expireDate,
      lastNotifiedText: db.data.lastSnowEmergencyText,
      moreInfo: PARKING_URL,
    };
  },
});
