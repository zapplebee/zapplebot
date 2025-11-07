import { text, tool, type Tool } from "@lmstudio/sdk";

const getCurrentDate = tool({
  name: "get_current_date",
  description: text`
      Get the current date in ISO format
    `,
  parameters: {},
  implementation: async () => {
    return {
      date: new Date().toISOString(),
    };
  },
});

const getTimeZone = tool({
  name: "get_time_zone",
  description: text`
      Get the current timezone
    `,
  parameters: {},
  implementation: async () => {
    return {
      tz: "America/Chicago",
    };
  },
});

const getLocation = tool({
  name: "get_location",
  description: text`
      Get where Zapplebot is hosted
    `,
  parameters: {},
  implementation: async () => {
    return {
      state: "Minnesota",
      city: "Minneapolis",
    };
  },
});

export const utilTools: Array<Tool> = [
  getCurrentDate,
  getLocation,
  getTimeZone,
];
