import { fetchInventoryData, fetchPlanActualData } from '@/actions/inventory';
import { InventoryAnalysisResult, PlanActualComparisonResult, ViewType } from '@/types/inventory';
import { NextRequest, NextResponse } from 'next/server';

type DownloadMode = 'inventory' | 'plan';
type StatusFilter = 'ALL' | PlanActualComparisonResult['utilizationStatus'];

const escapeCsvCell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;

const formatPeriodDate = (value: string | undefined) => {
  const str = String(value || '');
  if (str.length !== 8) return str || '-';
  return `${str.substring(0, 4)}-${str.substring(4, 6)}-${str.substring(6, 8)}`;
};

const statusLabel: Record<PlanActualComparisonResult['utilizationStatus'], string> = {
  ON_TRACK: '계획권',
  UNDER: '미달',
  OVER: '초과',
  NO_PLAN: '계획 없음',
};

const matchesSearch = (searchKeyword: string) => (item: { materialCode: string; materialName: string }) => {
  if (!searchKeyword) return true;

  const lowerSearch = searchKeyword.toLowerCase();
  return (
    item.materialCode.toLowerCase().includes(lowerSearch) ||
    item.materialName.toLowerCase().includes(lowerSearch)
  );
};

const buildCsvResponse = (filePrefix: string, headers: string[], rows: Array<Array<unknown>>) => {
  const csv = '\uFEFF' + [headers.map(escapeCsvCell).join(','), ...rows.map(row => row.map(escapeCsvCell).join(','))].join('\n');
  const dateStr = new Date().toISOString().slice(0, 10);
  const encodedFileName = encodeURIComponent(`${filePrefix}_${dateStr}.csv`);

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodedFileName}`,
      'Cache-Control': 'private, no-store',
    },
  });
};

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode: DownloadMode = searchParams.get('mode') === 'plan' ? 'plan' : 'inventory';
  const plant = searchParams.get('plant') || 'ALL';
  const group = searchParams.get('group') || 'ALL';
  const view = (searchParams.get('view') as ViewType) || 'ALL';
  const refDate = searchParams.get('refDate') || undefined;
  const searchKeyword = searchParams.get('search') || '';

  if (mode === 'plan') {
    const periodMonths = searchParams.get('period') === '12' ? 12 : 24;
    const status: StatusFilter = ['ON_TRACK', 'UNDER', 'OVER', 'NO_PLAN'].includes(searchParams.get('status') || '')
      ? searchParams.get('status') as StatusFilter
      : 'ALL';

    const result = await fetchPlanActualData(plant, group, view, refDate, periodMonths);
    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Failed to generate CSV.' }, { status: 500 });
    }

    let data = (result.data || []).filter(matchesSearch(searchKeyword));
    if (status !== 'ALL') {
      data = data.filter(item => item.utilizationStatus === status);
    }

    return buildCsvResponse(
      'plan_actual_analysis',
      [
        'Plant', 'Group', 'Material Code', 'Material Name', 'Inventory Quantity', 'Unit', 'Inventory Amount',
        'Plan Start', 'Plan End', 'Planned Quantity', 'Actual Quantity', 'Variance Quantity',
        'Achievement Rate (%)', 'Remaining Plan Quantity', 'Stock To Plan (%)', 'Status',
      ],
      data.map(item => [
        item.plant,
        item.materialGroup,
        item.materialCode,
        item.materialName,
        item.currentQuantity,
        item.unit,
        item.totalAmount,
        formatPeriodDate(item.planPeriodStart),
        formatPeriodDate(item.planPeriodEnd),
        item.plannedQuantity,
        item.actualQuantity,
        item.varianceQuantity,
        item.achievementRate ?? '-',
        item.remainingPlanQuantity,
        item.stockToPlanRate ?? '-',
        statusLabel[item.utilizationStatus] || item.utilizationStatus,
      ])
    );
  }

  const result = await fetchInventoryData(plant, group, view, refDate);
  if (!result.success) {
    return NextResponse.json({ error: result.error || 'Failed to generate CSV.' }, { status: 500 });
  }

  const data = (result.data || []).filter(matchesSearch(searchKeyword));

  return buildCsvResponse(
    'inventory_analysis',
    [
      'Plant', 'Group', 'Material Code', 'Material Name', 'Inventory Quantity', 'Unit', 'Unit Price', 'Inventory Amount',
      'First Receipt Date', 'Last Receipt Date', 'Last Receipt Quantity',
      'Last Issue Date', 'Last Issue Quantity', 'Last 6M Issue Quantity', 'Monthly Avg Issue Quantity',
      'Coverage Months', 'Inactive Days', 'BOM Status',
    ],
    data.map((item: InventoryAnalysisResult) => [
      item.plant,
      item.materialGroup,
      item.materialCode,
      item.materialName,
      item.currentQuantity,
      item.unit,
      item.unitPrice,
      item.totalAmount,
      item.firstReceiptDate || '-',
      item.lastReceiptDate || '-',
      item.lastReceiptQty,
      item.lastIssueDate || '-',
      item.lastIssueQty,
      item.last6MonthsIssueQty,
      item.monthlyAvgIssueQty,
      item.coverageMonths === 999 ? 'Infinite' : item.coverageMonths ?? '-',
      item.inactiveDays ?? '-',
      item.bomStatus,
    ])
  );
}
