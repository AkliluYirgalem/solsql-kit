import { Address, fetchEncodedAccount, fetchEncodedAccounts, MaybeEncodedAccount } from "@solana/kit";
import { deserialize } from "@dao-xyz/borsh";
import bs58 from "bs58";
import { getPDA } from "./getPDA"
import { TableMetadata } from "../schema";
import { type Client } from "../types";
import { SOLSQL_PROGRAM_ID } from "../constants";
import { getAllRows } from "./getAllRows";
import { extractDatas } from "./extractDatas";

export async function findRows(client: Client, tablePDA: Address, query: Record<number, string>, raw_account: boolean = false): Promise<string[] | MaybeEncodedAccount> {
    const tableAccount = await fetchEncodedAccount(client.rpc, tablePDA);
    if (tableAccount.exists) {
        const latest_table_metadata = deserialize(tableAccount.data, TableMetadata);
        const allRows = await getAllRows(latest_table_metadata);
        let queriedDatas: MaybeEncodedAccount[] = [];
        for (let i = 0; i < allRows.length; i += 100) {
            const fetched_data_accounts = await fetchEncodedAccounts(client.rpc, allRows.slice(i, i + 100));
            for (const account of fetched_data_accounts) {
                let match = true;
                if (account.exists) {
                    let bytes_row_id = account.data.slice(0, 4);
                    for (const key in query) {
                        const col = Number(key);
                        const data = query[col];
                        let from = 8 + 32 * (col - 1); //we will use this for extracting the address from the list of array
                        let to = from + 32;
                        let [expectedAddress, _bump] = await getPDA([
                            latest_table_metadata.authority,
                            latest_table_metadata.table_name,
                            new Uint8Array(bytes_row_id), new Uint8Array([col]),
                            data,
                        ], SOLSQL_PROGRAM_ID);
                        let foundAddress = bs58.encode(account.data.slice(from, to));
                        if (expectedAddress != foundAddress) {
                            match = false;
                            break;
                        }
                    }
                    if (match)
                        queriedDatas.push(account);
                    if (match && raw_account)
                        return account;
                }
            }
        }
        if (queriedDatas.length == 0)
            return [];
        return await extractDatas(client, queriedDatas);
    }
    return [];
}
