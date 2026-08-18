import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: {
      "react/index": "src/react/index.ts",
      "core/index": "src/core/index.ts"
    },
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    clean: true,
    treeshake: true,
    splitting: false,
    minify: false,
    external: ["react", "react-dom"]
  }
]);
