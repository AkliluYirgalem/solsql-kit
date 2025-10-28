import { Address } from "@solana/kit";
import { SOLSQL_PROGRAM_ID } from "../constants";
import { TableMetadata } from "../schema";
import { getPDA } from "./getPDA";

export async function getAllRows(latest_table_metadata: TableMetadata): Promise<Address[]> {
    let pdas: Address[] = [];
    const row_id = new ArrayBuffer(4);
    const row_id_view = new DataView(row_id);
    for (let row = 1; row <= latest_table_metadata.last_available_row_id; row++) {
        row_id_view.setUint32(0, row, true);
        let [_pda, _bump] = await getPDA([
            latest_table_metadata.authority, latest_table_metadata.table_name,
            new Uint8Array(row_id)], SOLSQL_PROGRAM_ID);
        pdas.push(_pda);
    }
    return pdas;
}
