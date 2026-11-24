import type { ReactNode } from 'react';
import { BlueSpinner } from './Spinner';

// BLUE3 BTable → BlueTable (no plugin template yet; props: columns, data, loading).
export interface BlueTableColumn<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  width?: string;
}

export interface BlueTableProps<T> {
  columns: BlueTableColumn<T>[];
  data: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  /** Shown instead of rows when `data` is empty and not loading. */
  empty?: ReactNode;
  caption?: string;
}

/** Scrolls sideways inside its own box on narrow screens, so the page itself never scrolls horizontally. */
export function BlueTable<T>({ columns, data, rowKey, loading = false, empty, caption }: BlueTableProps<T>) {
  return (
    <div className="blue-table" aria-busy={loading}>
      <table className="blue-table__table">
        {caption ? <caption className="visually-hidden">{caption}</caption> : null}
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col" style={column.width ? { width: column.width } : undefined}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((column) => (
                <td key={column.key}>{column.render(row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {loading && data.length === 0 ? (
        <div className="blue-table__state">
          <BlueSpinner />
        </div>
      ) : null}
      {!loading && data.length === 0 && empty ? <div className="blue-table__state">{empty}</div> : null}
    </div>
  );
}
