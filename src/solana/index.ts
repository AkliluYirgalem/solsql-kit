import {
    KeyPairSigner, createSolanaRpc, Address, Instruction, AccountRole,
    fetchEncodedAccount, createSolanaRpcSubscriptions, MaybeEncodedAccount,
    fetchEncodedAccounts
} from "@solana/kit";
import { SYSTEM_PROGRAM_ADDRESS } from "@solana-program/system";
import { serialize, deserialize } from "@dao-xyz/borsh";
import bs58 from "bs58";

import { type Client } from "../types";
import { RPC_URLS, SOLSQL_PROGRAM_ID } from "../constants";
import { TableMetadata } from "../schema";
import { keyPairLoader, sendTransaction, getPDA, compareColumnNames, findRows, getAllRows, extractDatas } from "../utils";

import { RowMetadata } from "../schema/RowMetadata";
import { isNewEntry } from "../utils/isNewEntry";

interface initTableInput {
    authority: string,
    tableName: string,
    columns: Record<string, { unique?: true }>,
};

interface UpdateSchema {
    selector: Record<string, string>,
    into: Record<string, string>
}

/**
 * Represents a client for SolSQL operations.
 */
export class SolSQLClient {
    private client: Client;
    private authority!: KeyPairSigner;
    private programId: Address = SOLSQL_PROGRAM_ID;
    private feeVaultPDA!: Address;

    private tablePDA!: Address;
    private tableName!: string;
    private columnNames!: string[];
    private columnSchema!: Record<string, { unique?: boolean }>;

    constructor(cluster: string) {
        const rpcUrl = RPC_URLS[cluster];
        this.client = {
            rpc: createSolanaRpc(rpcUrl || cluster),
            rpcSubscriptions: createSolanaRpcSubscriptions('ws://127.0.0.1:8900'),
        };
    }

    async createTable(input: initTableInput) {
        this.authority = await keyPairLoader(input.authority);
        [this.feeVaultPDA] = await getPDA(["fee_vault"], this.programId);

        this.tableName = input.tableName;
        this.columnNames = Object.keys(input.columns);
        this.columnSchema = input.columns;
        const tableData = new TableMetadata({
            authority: bs58.decode(this.authority.address),
            table_name: this.tableName,
            num_of_columns: this.columnNames.length,
            last_available_row_id: 1, //default it starts at row 1
        });

        const [_pda, _bump] = await getPDA([tableData.authority, tableData.table_name], this.programId);
        this.tablePDA = _pda;

        const tableAccount = await fetchEncodedAccount(this.client.rpc, this.tablePDA);
        if (tableAccount.exists) return;

        const ix: Instruction = {
            accounts: [
                { address: this.authority.address, role: AccountRole.WRITABLE_SIGNER },
                { address: this.tablePDA, role: AccountRole.WRITABLE },
                { address: this.feeVaultPDA, role: AccountRole.WRITABLE },
                { address: SYSTEM_PROGRAM_ADDRESS, role: AccountRole.READONLY },
            ],
            data: Buffer.concat([Buffer.from([0]), serialize(tableData)]),
            programAddress: this.programId,
        }
        let signature = await sendTransaction(this.client, this.authority, ix);
        while (true) {
            const status = await this.client.rpc.getSignatureStatuses([signature]).send();
            if (status.value[0]?.confirmationStatus === "finalized")
                break;
            await new Promise(r => setTimeout(r, 500));
        }
    }

    async insertIntoTable(passedRow: Record<string, string>): Promise<number> {
        const passedCols = Object.keys(passedRow);
        compareColumnNames(this.columnNames, passedCols);
        for (const passedCol of passedCols) {
            if (this.columnSchema[passedCol].unique) {
                const ret = await isNewEntry(this.client, this.tablePDA, this.columnNames.indexOf(passedCol) + 1, passedRow[passedCol]);
                if (!ret)
                    throw new Error(`${passedCol} is Unique`);
            }
        }
        const flattenRowData: string[] = [];
        for (const col of this.columnNames)
            flattenRowData.push(passedRow[col]);
        const newRow = new RowMetadata({ datas: flattenRowData });

        const tableAccount = await fetchEncodedAccount(this.client.rpc, this.tablePDA);
        if (tableAccount.exists) {
            const latest_table_metadata = deserialize(tableAccount.data, TableMetadata);
            const latest_row_id = new ArrayBuffer(4);
            const view = new DataView(latest_row_id);
            view.setUint32(0, latest_table_metadata.last_available_row_id, true);

            const [latest_row_pda, _bump] = await getPDA([
                latest_table_metadata.authority,
                latest_table_metadata.table_name,
                new Uint8Array(latest_row_id),
            ], this.programId);

            const data_pdas: { address: Address, role: AccountRole.WRITABLE }[] = [];
            for (let col = 1; col <= latest_table_metadata.num_of_columns; col++) {
                const [data_pda, _bump] = await getPDA([
                    latest_table_metadata.authority,
                    latest_table_metadata.table_name,
                    new Uint8Array(latest_row_id), new Uint8Array([col]),
                    newRow.datas[col - 1]], this.programId);

                data_pdas.push({ address: data_pda, role: AccountRole.WRITABLE });
            }

            const ix: Instruction = {
                accounts: [
                    { address: this.authority.address, role: AccountRole.WRITABLE_SIGNER },
                    { address: this.tablePDA, role: AccountRole.WRITABLE },
                    { address: this.feeVaultPDA, role: AccountRole.WRITABLE },
                    { address: SYSTEM_PROGRAM_ADDRESS, role: AccountRole.READONLY },
                    { address: latest_row_pda, role: AccountRole.WRITABLE },
                    ...data_pdas
                ],
                programAddress: this.programId,
                data: Buffer.concat([Buffer.from([1]), serialize(newRow)]),
            }
            const signature = await sendTransaction(this.client, this.authority, ix);
            while (true) {
                const status = await this.client.rpc.getSignatureStatuses([signature]).send();
                if (status.value[0]?.confirmationStatus === "finalized") {
                    break;
                }
                await new Promise(r => setTimeout(r, 500));
            }
            return latest_table_metadata.last_available_row_id
        }
        return -1;
    }

    async select(passedQuery: Record<string, string>): Promise<Record<string, string>[]> {
        let query: Record<number, string> = {};
        const refined_rows: Record<string, string>[] = [];
        if (!Object.keys(passedQuery).every(col => this.columnNames.includes(col)))
            throw new Error("Unknown Column Name");
        for (let i = 0; i < this.columnNames.length; i++)
            if (passedQuery[this.columnNames[i]])
                query[i + 1] = passedQuery[this.columnNames[i]];
        let ret_rows = await findRows(this.client, this.tablePDA, query) as string[];
        for (let i = 0; i < ret_rows.length; i += this.columnNames.length) {
            const obj = Object.fromEntries(this.columnNames.map((k, j) => [k, ret_rows[i + j]]));
            refined_rows.push(obj);
        }

        return refined_rows;
    }

    async selectAll(): Promise<Record<string, string>[]> {
        let allExistingRows: MaybeEncodedAccount[] = [];
        const tableAccount = await fetchEncodedAccount(this.client.rpc, this.tablePDA);
        if (tableAccount.exists) {
            const latest_table_metadata = deserialize(tableAccount.data, TableMetadata);
            const allRows = await getAllRows(latest_table_metadata);
            for (let i = 0; i < allRows.length; i += 100) {
                const fetched_data_accounts = await fetchEncodedAccounts(this.client.rpc, allRows.slice(i, i + 100));
                allExistingRows.push(...fetched_data_accounts.filter((account) => account.exists));
            }
        }
        let ret_rows = await extractDatas(this.client, allExistingRows);
        const refined_rows: Record<string, string>[] = [];
        for (let i = 0; i < ret_rows.length; i += this.columnNames.length) {
            const obj = Object.fromEntries(this.columnNames.map((k, j) => [k, ret_rows[i + j]]));
            refined_rows.push(obj);
        }
        return refined_rows
    }

    async update(passedUpdator: UpdateSchema): Promise<number> {
        const selector = Object.keys(passedUpdator.selector)[0];
        if (Object.keys(passedUpdator.selector).length != 1)
            throw new Error("Only one selector is allowed");
        if (!this.columnNames.includes(selector))
            throw new Error("Unknown Column Name");
        if (!this.columnSchema[selector].unique)
            throw new Error("Selector must have a unique property");

        const selectorColNum = this.columnNames.indexOf(selector) + 1;
        const selectorValue = passedUpdator.selector[selector];
        const quried_row_account = await findRows(this.client, this.tablePDA, { [selectorColNum]: selectorValue }, true) as MaybeEncodedAccount;

        for (const passedCol in passedUpdator.into) {
            if (this.columnSchema[passedCol].unique) {
                const ret = await isNewEntry(this.client, this.tablePDA, this.columnNames.indexOf(passedCol) + 1, passedUpdator.into[passedCol]);
                if (!ret)
                    throw new Error(`${passedCol} is Unique`);
            }
        }

        if (quried_row_account.exists) {
            const row_address = quried_row_account.address;
            const row_id = quried_row_account.data.slice(0, 4);

            let new_and_old_data_fields: { address: Address, role: AccountRole.WRITABLE }[] = [];
            for (const key in passedUpdator.into) {
                const colNum = this.columnNames.indexOf(key) + 1;
                const value = passedUpdator.into[key];
                const [new_pda, _bump] = await getPDA([
                    bs58.decode(this.authority.address),
                    this.tableName,
                    row_id, new Uint8Array([colNum]),
                    value], this.programId);
                const old_pda = bs58.encode(quried_row_account.data.slice(8 + 32 * (colNum - 1), 40 + 32 * (colNum - 1))) as Address;
                new_and_old_data_fields.push({ address: old_pda, role: AccountRole.WRITABLE });
                new_and_old_data_fields.push({ address: new_pda, role: AccountRole.WRITABLE });
            }

            const flattenRowData: string[] = [];
            for (const col of this.columnNames) {
                if (col in passedUpdator.into)
                    flattenRowData.push(passedUpdator.into[col]);
            }
            const newRow = new RowMetadata({ datas: flattenRowData });

            const ix: Instruction = {
                accounts: [
                    { address: this.authority.address, role: AccountRole.WRITABLE_SIGNER },
                    { address: this.tablePDA, role: AccountRole.WRITABLE },
                    { address: this.feeVaultPDA, role: AccountRole.WRITABLE },
                    { address: SYSTEM_PROGRAM_ADDRESS, role: AccountRole.READONLY },
                    { address: row_address, role: AccountRole.WRITABLE },
                    ...new_and_old_data_fields
                ],
                programAddress: this.programId,
                data: Buffer.concat([Buffer.from([2]), serialize(newRow)]),
            }
            const signature = await sendTransaction(this.client, this.authority, ix);
            while (true) {
                const status = await this.client.rpc.getSignatureStatuses([signature]).send();
                if (status.value[0]?.confirmationStatus === "finalized") {
                    break;
                }
                await new Promise(r => setTimeout(r, 500));
            }
            return 1;
        }
        return -1;
    }

    async delete(passedSelector: Record<string, string>): Promise<number> {
        const selector = Object.keys(passedSelector)[0];
        if (Object.keys(passedSelector).length != 1)
            throw new Error("Only one selector is allowed");
        if (!this.columnNames.includes(selector))
            throw new Error("Unknown Column Name");
        if (!this.columnSchema[selector].unique)
            throw new Error("Selector must have a unique property");

        const selectorColNum = this.columnNames.indexOf(selector) + 1;
        const selectorValue = passedSelector[selector];
        const queried_row_account = await findRows(this.client, this.tablePDA, { [selectorColNum]: selectorValue }, true) as MaybeEncodedAccount;
        const toBeDeletedAccounts: { address: Address, role: AccountRole.WRITABLE }[] = [];

        if (queried_row_account.exists) {
            toBeDeletedAccounts.push({ address: queried_row_account.address, role: AccountRole.WRITABLE });
            for (let i = 0; i < this.columnNames.length; i++) {
                let dataAddr = bs58.encode(queried_row_account.data.slice(8 + i * 32, i * 32 + 40));
                toBeDeletedAccounts.push({ address: dataAddr as Address, role: AccountRole.WRITABLE });
            }
            const ix: Instruction = {
                accounts: [
                    { address: this.authority.address, role: AccountRole.WRITABLE_SIGNER },
                    { address: this.tablePDA, role: AccountRole.WRITABLE },
                    { address: this.feeVaultPDA, role: AccountRole.WRITABLE },
                    { address: SYSTEM_PROGRAM_ADDRESS, role: AccountRole.READONLY },
                    ...toBeDeletedAccounts
                ],
                programAddress: this.programId,
                data: Buffer.from([3]),
            }
            const signature = await sendTransaction(this.client, this.authority, ix);
            while (true) {
                const status = await this.client.rpc.getSignatureStatuses([signature]).send();
                if (status.value[0]?.confirmationStatus === "finalized") {
                    break;
                }
                await new Promise(r => setTimeout(r, 500));
            }
            return 1;
        }
        return -1;
    }
}
