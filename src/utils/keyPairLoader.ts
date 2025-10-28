import fs from "fs";
import path from "path";
import os from "os";
import { createKeyPairSignerFromBytes, KeyPairSigner } from "@solana/kit";

export async function keyPairLoader(filePath: string): Promise<KeyPairSigner> {
    const resolved = path.resolve(
        filePath.startsWith("~")
            ? filePath.replace("~", os.homedir())
            : filePath
    );
    const raw = fs.readFileSync(resolved, "utf8");
    const keypairBytes = Uint8Array.from(JSON.parse(raw));
    const signer = await createKeyPairSignerFromBytes(keypairBytes);
    return signer;
}



