import { field, vec } from "@dao-xyz/borsh";

export class RowMetadata {
    @field({ type: vec("string") })
    datas: string[];

    constructor(init: RowMetadata) {
        this.datas = init.datas;
    }
}
