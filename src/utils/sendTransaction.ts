import {
    KeyPairSigner, createTransactionMessage, pipe, setTransactionMessageFeePayerSigner,
    setTransactionMessageLifetimeUsingBlockhash, Instruction,
    appendTransactionMessageInstructions, signTransactionMessageWithSigners,
    sendTransactionWithoutConfirmingFactory, getSignatureFromTransaction
} from "@solana/kit";
import { type Client } from "../types";

export async function sendTransaction(client: Client, signer: KeyPairSigner, ix: Instruction): Promise<ReturnType<typeof getSignatureFromTransaction>> {
    const { value: latestBlockhash } = await client.rpc.getLatestBlockhash().send();
    const transactionMessage = pipe(
        createTransactionMessage({ version: 0 }),
        (tx) => setTransactionMessageFeePayerSigner(signer, tx),
        (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
        (tx) => appendTransactionMessageInstructions([ix], tx),
    );
    const transaction = await signTransactionMessageWithSigners(transactionMessage);
    const sendTx = sendTransactionWithoutConfirmingFactory({ rpc: client.rpc });
    await sendTx(transaction, { commitment: 'finalized' });
    return getSignatureFromTransaction(transaction);
}
