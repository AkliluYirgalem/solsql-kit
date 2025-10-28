import { defineConfig } from "tsup";

export default defineConfig([
    {
        entry: ["src/index.ts"],
        format: ["esm"],
        outDir: "lib/esm",
        dts: true,
        clean: true
    },
    {
        entry: ["src/index.ts"],
        format: ["cjs"],
        outDir: "lib/cjs"
    }
]);
