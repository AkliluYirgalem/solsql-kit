import { field, fixedArray } from "@dao-xyz/borsh";

export class TableMetadata {
    @field({ type: fixedArray("u8", 32) }) //32bytes
    authority: Uint8Array;

    @field({ type: "string" })
    table_name: string;

    @field({ type: "u8" }) // 1byte
    num_of_columns: number;

    @field({ type: "u32" }) //4bytes
    last_available_row_id: number;

    constructor(init: TableMetadata) {
        this.authority = init.authority;
        this.table_name = init.table_name;
        this.num_of_columns = init.num_of_columns;
        this.last_available_row_id = init.last_available_row_id;
    }
}

