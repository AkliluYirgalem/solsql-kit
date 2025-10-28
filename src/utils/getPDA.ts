import { Address, getProgramDerivedAddress, ProgramDerivedAddress } from "@solana/kit";
import { hashSeeds } from "./hashSeeds";

export async function getPDA(seeds: (Uint8Array | string)[], programId: Address): Promise<ProgramDerivedAddress> {
    const hashedSeed = await hashSeeds(seeds);
    let pda = await getProgramDerivedAddress({
        programAddress: programId, seeds: [hashedSeed]
    });
    return pda;
}
