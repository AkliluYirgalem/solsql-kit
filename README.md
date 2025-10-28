SolSQL-kit is a client-side api to communicate with the SOLSQL program on solana.
It can serve as a drop-in replacement for the SQL systems used in traditional web2 backends.

### Installation

```bash
pnpm add -D solsql-kit
```

### Connection

This will make a connection to the devnet.

```ts
import { SolSQLClient } from 'solsql-kit';
const solsql = new SolSQLClient('devnet');
```

### Creating table

**Parameters:**

- `authority` (string): Path to your KEY-PAIR also who can mutate the table.
- `tableName` (string): Table Name, unique per authority.
- `columns` (Record<string, { unique?: true }>): Table's schema,

```ts
await solsql.createTable({
  authority: './YOUR-KEY-PAIR.json',
  tableName: 'TableNAme',
  columns: {
    fname: {},
    lname: {},
    email: { unique: true },
  },
});
```

### Data insertion

```ts
await solsql.insertIntoTable({ fname: 'John', lname: 'Doe', email: 'johndoe@test.com' });
```

**Returns:**  
`Promise<number>` - The row_id or -1 if it failed.

### Fetching by specific column value

```ts
await solsql.select({ email: 'johndoe@test.com' }); //by email
await solsql.select({ fname: 'John' }); //by fname
await solsql.select({ fname: 'John', lname: 'Doe' }); //by fname and lname
```

**Returns:**  
`Promise<Record<string, string>[]>` - an array of the queried data, or empty if there are none.

### Fetching all data

```ts
await solsql.selectAll();
```

**Returns:**  
`Promise<Record<string, string>[]>` - an array of all inserted data, or empty if there are none.

### Updating data

**Parameters:**

- `selector`: Defines the specific record to update, the selector's key must be unique-key.
- `into`: which values you want to update/edit.

```ts
await solsql.update({
  selector: { email: 'johndoe@test.com' },
  into: { fname: 'new fname' },
});

await solsql.update({
  selector: { email: 'johndoe@test.com' },
  into: { fname: 'new fname', lname: 'new lname' },
});

await solsql.update({
  selector: { email: 'johndoe@test.com' },
  into: { email: 'newjohndoe@test.com' },
});
```

**Returns:**  
`Promise<number>` - returns 1 it it successfully updated it, -1 if it failed.

### Deleting data

```ts
await solsql.delete({ email: 'johndoe@test.com' });
```

**Returns:**  
`Promise<number>` - returns 1 it it successfully updated it, -1 if it failed.
