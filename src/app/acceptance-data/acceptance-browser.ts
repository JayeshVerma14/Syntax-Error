/** Browser-test locators shared by every acceptance row module. */

export const controlBrowser = (testName: string) =>
  ({ budget: "standard", file: "e2e/app-controls.spec.ts", testName }) as const;

export const outputBrowser = (testName: string) =>
  ({ budget: "extended-io", file: "e2e/app-output.spec.ts", testName }) as const;

export const renderBrowser = (testName: string) =>
  ({ budget: "standard", file: "e2e/app-output.spec.ts", testName }) as const;
