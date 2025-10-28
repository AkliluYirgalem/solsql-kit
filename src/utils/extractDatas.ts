import { Address, fetchEncodedAccounts, MaybeEncodedAccount } from "@solana/kit";
import bs58 from "bs58";
import { Client } from "../types";

export async function extractDatas(client: Client, rows: MaybeEncodedAccount[]): Promise<string[]> {
    if (rows[0] && rows[0].exists) {
        const decoder = new TextDecoder();
        // const byte_row_id = rows[0].data.slice(0, 4);
        // const row_id_view = new DataView(byte_row_id.buffer, 0, 4);
        // const row_id = row_id_view.getUint32(0, true);

        const byte_num_cols = rows[0].data.slice(4, 8);
        const col_nums_view = new DataView(byte_num_cols.buffer, 0, 4);
        const num_cols = col_nums_view.getUint32(0, true);

        let pdas: Address[] = [];
        for (const row of rows) {
            for (let j = 0; j < num_cols; j++) {
                if (row.exists) {
                    const sliced_col = row.data.slice(8 + j * 32, 40 + j * 32);
                    let col_add = bs58.encode(sliced_col) as Address;
                    pdas.push(col_add);
                }
            }
        }
        let extracted_data: string[] = [];
        for (let i = 0; i < pdas.length; i += 100) {
            const fetched_data_accounts = await fetchEncodedAccounts(client.rpc, pdas.slice(i, i + 100));
            extracted_data = fetched_data_accounts.
                filter((account) => account.exists).
                map((account) => decoder.decode(account.data.slice(32)));
        }
        return extracted_data;
    }
    return [];
}