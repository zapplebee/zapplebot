import { z } from "zod";

export type BotTool<P extends z.ZodRawShape = z.ZodRawShape> = {
  name: string;
  description: string;
  parameters: P;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  implementation: (args: any) => Promise<unknown>;
};

export function tool<P extends z.ZodRawShape>(def: BotTool<P>): BotTool<P> {
  return def;
}

export function text(
  strings: TemplateStringsArray,
  ...values: unknown[]
): string {
  return strings.reduce<string>(
    (acc, str, i) => acc + str + (values[i] ?? ""),
    ""
  );
}
