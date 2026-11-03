import type { Config } from "jest";

const config: Config = {
  testEnvironment: "jsdom",
  roots: ["<rootDir>/tests"],
  testPathIgnorePatterns: ["/node_modules/", "<rootDir>/tests/mocks/"],
  transform: { "^.+\\.tsx?$": ["ts-jest", { tsconfig: "<rootDir>/tsconfig.test.json" }] },
  moduleNameMapper: { "\\.css$": "identity-obj-proxy", "^@/(.*)$": "<rootDir>/src/$1", "^leaflet$": "<rootDir>/tests/mocks/leaflet.ts" },
  setupFilesAfterEnv: ["<rootDir>/tests/setup.ts"],
  // Form tests type a lot; leave room for slow CI machines.
  testTimeout: 15000,
};

export default config;
