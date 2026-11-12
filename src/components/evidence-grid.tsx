'use client';
import { useMemo } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry, themeQuartz, type ColDef } from 'ag-grid-community';
import type { RequirementView, ResultView } from '@/lib/ui-types';
ModuleRegistry.registerModules([AllCommunityModule]);
type Row = { id: string; description: string; method: string; status: string; evidence: number };
const theme = themeQuartz.withParams({
  accentColor: '#aac2dc',
  backgroundColor: '#101722',
  foregroundColor: '#d8e3f1',
  borderColor: '#2c3c52',
  headerBackgroundColor: '#192437',
  headerTextColor: '#a3b7d1',
  fontFamily: 'Segoe UI, Arial, sans-serif',
  fontSize: 14,
  rowHeight: 64,
  headerHeight: 44,
  wrapperBorderRadius: 12,
});
export default function EvidenceGrid({
  requirements,
  results,
  onSelect,
}: {
  requirements: RequirementView[];
  results: ResultView[];
  onSelect: (id: string) => void;
}) {
  const rows = useMemo(
    () =>
      requirements.map((r) => {
        const result = results.find((c) => c.requirementId === r.id);
        return {
          id: r.id,
          description: r.description,
          method: r.method.replaceAll('_', ' ').toLowerCase(),
          status: (result?.status ?? 'not_verified').replaceAll('_', ' '),
          evidence: result?.evidenceIds.length ?? 0,
        };
      }),
    [requirements, results],
  );
  const columns = useMemo<ColDef<Row>[]>(
    () => [
      {
        field: 'description',
        headerName: 'Acceptance criterion',
        flex: 2,
        minWidth: 220,
        wrapText: true,
        autoHeight: true,
        cellStyle: { lineHeight: '1.5', paddingTop: '14px', paddingBottom: '14px' },
      },
      { field: 'method', headerName: 'Verification', flex: 1, minWidth: 150 },
      { field: 'evidence', headerName: 'Files', width: 85 },
      {
        field: 'status',
        headerName: 'Result',
        minWidth: 145,
        cellRenderer: (p: { value: string }) => (
          <span
            className={`badge ${p.value === 'pass' ? 'green' : p.value === 'fail' ? 'red' : 'amber'}`}
          >
            {p.value === 'pass' ? '✓ Passed' : p.value === 'fail' ? '× Failed' : p.value}
          </span>
        ),
      },
    ],
    [],
  );
  return (
    <>
      <div
        className="evidence-grid"
        style={{ height: Math.min(440, Math.max(175, requirements.length * 66 + 46)) }}
      >
        <AgGridReact<Row>
          theme={theme}
          rowData={rows}
          columnDefs={columns}
          defaultColDef={{ sortable: true, filter: true, resizable: true }}
          getRowId={(p) => p.data.id}
          onRowClicked={(e) => e.data && onSelect(e.data.id)}
          onCellKeyDown={(e) => {
            if ((e.event as KeyboardEvent)?.key === 'Enter' && e.data) onSelect(e.data.id);
          }}
        />
      </div>
      <div className="criterion-cards" aria-label="Acceptance evidence review">
        {rows.map((row) => (
          <button className="criterion-card" key={row.id} onClick={() => onSelect(row.id)}>
            <strong>{row.description}</strong>
            <span>
              {row.method} · {row.evidence} file{row.evidence === 1 ? '' : 's'}
            </span>
            <span
              className={`badge ${row.status === 'pass' ? 'green' : row.status === 'fail' ? 'red' : 'amber'}`}
            >
              {row.status === 'pass' ? '✓ Passed' : row.status === 'fail' ? '× Failed' : row.status}
            </span>
            <small>Inspect evidence →</small>
          </button>
        ))}
      </div>
    </>
  );
}
