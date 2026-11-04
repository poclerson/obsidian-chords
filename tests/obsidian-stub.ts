export const Platform = { isMacOS: false };
export async function requestUrl(): Promise<never> {
  throw new Error("obsidian.requestUrl was not mocked in this test");
}
