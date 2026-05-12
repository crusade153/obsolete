// components/ExcelDownloadButton.tsx
'use client';

import { InventoryAnalysisResult, PlanActualComparisonResult } from '@/types/inventory';

type DownloadMode = 'inventory' | 'plan';

interface Props {
  data: InventoryAnalysisResult[] | PlanActualComparisonResult[];
  mode?: DownloadMode;
}

const escapeCsvText = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;

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

export default function ExcelDownloadButton({ data, mode = 'inventory' }: Props) {
  const handleDownload = () => {
    try {
      if (!data || data.length === 0) {
        alert('다운로드할 데이터가 없습니다.');
        return;
      }

      let headers: string[];
      let rows: Array<Array<string | number>>;
      let filePrefix: string;

      if (mode === 'plan') {
        headers = [
          '플랜트', '분류', '자재코드', '제품명', '기말수량', '단위', '재고금액',
          '계획시작일', '계획종료일', '계획수량', '실적수량', '차이수량',
          '달성률(%)', '남은계획수량', '재고/계획(%)', '상태',
        ];
        rows = (data as PlanActualComparisonResult[]).map(item => [
          String(item.plant || ''),
          String(item.materialGroup || ''),
          String(item.materialCode || ''),
          escapeCsvText(item.materialName),
          Number(item.currentQuantity || 0),
          String(item.unit || ''),
          Number(item.totalAmount || 0),
          formatPeriodDate(item.planPeriodStart),
          formatPeriodDate(item.planPeriodEnd),
          Number(item.plannedQuantity || 0),
          Number(item.actualQuantity || 0),
          Number(item.varianceQuantity || 0),
          item.achievementRate !== null ? Number(item.achievementRate) : '-',
          Number(item.remainingPlanQuantity || 0),
          item.stockToPlanRate !== null ? Number(item.stockToPlanRate) : '-',
          statusLabel[item.utilizationStatus] || item.utilizationStatus,
        ]);
        filePrefix = '계획대비_실적_분석';
      } else {
        headers = [
          '플랜트', '분류', '자재코드', '제품명', '기말수량', '단위', '단가', '재고금액',
          '최초입고일', '마지막입고일', '마지막입고수량',
          '마지막출고일', '마지막출고수량', '최근6개월누적출고량', '월평균출고량',
          '재고회전(개월수)', '미활동일수(2026-02-28기준)', 'BOM존재여부',
        ];
        rows = (data as InventoryAnalysisResult[]).map(item => [
          String(item.plant || ''),
          String(item.materialGroup || ''),
          String(item.materialCode || ''),
          escapeCsvText(item.materialName),
          Number(item.currentQuantity || 0),
          String(item.unit || ''),
          Number(item.unitPrice || 0),
          Number(item.totalAmount || 0),
          String(item.firstReceiptDate || '-'),
          String(item.lastReceiptDate || '-'),
          Number(item.lastReceiptQty || 0),
          String(item.lastIssueDate || '-'),
          Number(item.lastIssueQty || 0),
          Number(item.last6MonthsIssueQty || 0),
          Number(item.monthlyAvgIssueQty || 0),
          item.coverageMonths === 999 ? '무한대(소비없음)' : (item.coverageMonths !== null ? Number(item.coverageMonths) : '-'),
          item.inactiveDays !== null ? Number(item.inactiveDays) : '-',
          String(item.bomStatus || 'N/A'),
        ]);
        filePrefix = '재고활동_히스토리_분석';
      }

      const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      
      const dateStr = new Date().toISOString().slice(0, 10);
      link.setAttribute('href', url);
      link.setAttribute('download', `${filePrefix}_${dateStr}.csv`);
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

    } catch (error: any) {
      console.error('엑셀 다운로드 중 에러 발생:', error);
      alert(`엑셀 생성 중 문제가 발생했습니다: ${error.message}`);
    }
  };

  return (
    <button
      onClick={handleDownload}
      className="bg-green-600 hover:bg-green-700 text-white px-5 py-2.5 rounded-lg text-sm font-bold shadow-md transition-all flex items-center gap-2 active:scale-95"
    >
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
      </svg>
      엑셀 다운로드
    </button>
  );
}
