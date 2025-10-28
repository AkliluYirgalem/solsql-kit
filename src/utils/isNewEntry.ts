import { Address, fetchEncodedAccount, fetchEncodedAccounts } from "@solana/kit";
import { Client } from "../types";
import { deserialize } from "@dao-xyz/borsh";
import { TableMetadata } from "../schema";
import { SOLSQL_PROGRAM_ID } from "../constants";
import { getPDA } from "./getPDA";

export async function isNewEntry(client: Client, tablePDA: Address, colNum: number, colValue: string): Promise<boolean> {
    const tableAccount = await fetchEncodedAccount(client.rpc, tablePDA);
    if (tableAccount.exists) {
        let latest_table_metadata = deserialize(tableAccount.data, TableMetadata);
        let pdas: Address[] = [];
        const row_id = new ArrayBuffer(4);
        const row_id_view = new DataView(row_id);
        for (let row = 1; row <= latest_table_metadata.last_available_row_id; row++) {
            row_id_view.setUint32(0, row, true);
            let [_pda, _bump] = await getPDA([
                latest_table_metadata.authority, latest_table_metadata.table_name,
                new Uint8Array(row_id), new Uint8Array([colNum]), colValue], SOLSQL_PROGRAM_ID);
            pdas.push(_pda);
        }
        for (let i = 0; i < pdas.length; i += 100) {
            const cols = (await fetchEncodedAccounts(client.rpc, pdas.slice(i, i + 100))).filter((account) => (account.exists));
            if (cols.length > 0)
                return false
        }
    }

    return true;
}
