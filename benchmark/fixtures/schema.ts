import {
  type RootwareColumnSnapshot,
  type RootwareSchemaSnapshot,
  type RootwareTableSnapshot,
  SCHEMA_SNAPSHOT_VERSION,
} from "@rootware/schema";

export const smallSchemaSnapshot = createBenchmarkSchemaSnapshot(4, 6);
export const largeSchemaSnapshot = createBenchmarkSchemaSnapshot(24, 12);
export const changedLargeSchemaSnapshot = createChangedSchemaSnapshot(
  largeSchemaSnapshot,
);

export function createBenchmarkSchemaSnapshot(
  tableCount: number,
  metricColumnCount: number,
): RootwareSchemaSnapshot {
  const tables: RootwareTableSnapshot[] = [];

  for (let tableIndex = 0; tableIndex < tableCount; tableIndex += 1) {
    const name = `benchmark_entity_${padded(tableIndex)}`;
    const columns = createColumns(tableIndex, metricColumnCount);

    tables.push({
      schema: "public",
      name,
      columns,
      primaryKey: {
        name: `${name}_pk`,
        columns: ["id"],
      },
      indexes: [
        {
          name: `${name}_tenant_created_idx`,
          columns: ["tenant_id", "created_at"],
        },
        {
          name: `${name}_slug_idx`,
          columns: ["slug"],
          unique: true,
        },
      ],
      uniqueConstraints: [
        {
          name: `${name}_tenant_slug_unique`,
          columns: ["tenant_id", "slug"],
        },
      ],
      checks: [
        {
          name: `${name}_metric_00_non_negative`,
          expression: "metric_00 >= 0",
        },
      ],
      metadata: {
        fixture: "benchmark",
        tableIndex,
      },
    });
  }

  return {
    version: SCHEMA_SNAPSHOT_VERSION,
    dialect: "postgres",
    tables,
    metadata: {
      fixture: "benchmark",
      tableCount,
      metricColumnCount,
    },
  };
}

export function createChangedSchemaSnapshot(
  snapshot: RootwareSchemaSnapshot,
): RootwareSchemaSnapshot {
  return {
    ...snapshot,
    tables: snapshot.tables.map((table, index) => {
      if (index % 3 !== 0) {
        return table;
      }

      return {
        ...table,
        columns: [
          ...table.columns,
          {
            name: "archived_at",
            type: {
              kind: "timestamp",
              dialectType: "timestamptz",
            },
            nullable: true,
          },
        ],
      };
    }),
    metadata: {
      ...snapshot.metadata,
      variant: "changed",
    },
  };
}

function createColumns(
  tableIndex: number,
  metricColumnCount: number,
): RootwareColumnSnapshot[] {
  const columns: RootwareColumnSnapshot[] = [
    {
      name: "id",
      type: {
        kind: "integer",
        dialectType: "bigserial",
      },
      nullable: false,
      generated: true,
    },
    {
      name: "tenant_id",
      type: {
        kind: "string",
        length: 36,
        dialectType: "uuid",
      },
      nullable: false,
    },
    {
      name: "slug",
      type: {
        kind: "string",
        length: 120,
        dialectType: "varchar",
      },
      nullable: false,
    },
    {
      name: "created_at",
      type: {
        kind: "timestamp",
        dialectType: "timestamptz",
      },
      nullable: false,
      default: {
        kind: "expression",
        sql: "now()",
      },
    },
    {
      name: "updated_at",
      type: {
        kind: "timestamp",
        dialectType: "timestamptz",
      },
      nullable: false,
      default: {
        kind: "expression",
        sql: "now()",
      },
    },
  ];

  for (let columnIndex = 0; columnIndex < metricColumnCount; columnIndex += 1) {
    columns.push({
      name: `metric_${padded(columnIndex)}`,
      type: {
        kind: "number",
        precision: 12,
        scale: 2,
        dialectType: "numeric",
      },
      nullable: columnIndex % 3 === 0,
      default: {
        kind: "literal",
        value: tableIndex + columnIndex,
      },
      metadata: {
        ordinal: columnIndex,
      },
    });
  }

  return columns;
}

function padded(value: number): string {
  return value.toString().padStart(2, "0");
}
