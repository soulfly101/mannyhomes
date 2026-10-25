import type { Config } from "jest";

const config: Config = {
  testEnvironment: "jsdom",
  roots: ["<rootDir>/tests"],
  transform: { "^.+\\.tsx?$": ["ts-jest", { tsconfig: "<rootDir>/tsconfig.test.json" }] },
  moduleNameMapper: { "\\.css$": "identity-obj-proxy" },
  setupFilesAfterEnv: ["<rootDir>/tests/setup.ts"],
};

export default config;
