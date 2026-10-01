declare module "saxen" {
  export class Parser {
    on(
      event: "openTag",
      callback: (name: string, getAttributes: () => Record<string, string>, decodeEntities: (value: string) => string) => void,
    ): this;
    on(event: "closeTag", callback: (name: string) => void): this;
    parse(xml: string): Error | undefined;
  }
}
