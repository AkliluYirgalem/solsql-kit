export function compareColumnNames(expected: string[], received: string[]): void {
    if (expected.length !== received.length) {
        throw new Error(
            `Column count mismatch: expected ${expected.length} columns, but received ${received.length}.`
        );
    }

    const missingColumns = expected.filter((col) => !received.includes(col));
    if (missingColumns.length > 0) {
        throw new Error(
            `Missing columns in received data: ${missingColumns.join(", ")}`
        );
    }

    const extraColumns = received.filter((col) => !expected.includes(col));
    if (extraColumns.length > 0) {
        throw new Error(
            `Unexpected extra columns: ${extraColumns.join(", ")}`
        );
    }
}
