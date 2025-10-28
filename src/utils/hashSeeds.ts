import { webcrypto } from "crypto";
const { subtle } = webcrypto;

export async function hashSeeds(seeds: (Uint8Array | string)[], debug: boolean = false): Promise<Uint8Array> {
    const seedBuffers: Uint8Array[] = seeds.map(seed => {
        if (typeof seed === "string") {
            return new TextEncoder().encode(seed);
        } else if (seed instanceof Uint8Array) {
            return seed;
        } else if (Array.isArray(seed)) {
            return new Uint8Array(seed);
        } else {
            throw new Error("Invalid seed type");
        }
    });

    const combined = new Uint8Array(seedBuffers.reduce((acc, curr) => acc + curr.length, 0));
    let offset = 0;
    for (const buf of seedBuffers) {
        combined.set(buf, offset);
        offset += buf.length;
    }
    const hashBuffer = await subtle.digest("SHA-256", combined);
    return new Uint8Array(hashBuffer);
}
