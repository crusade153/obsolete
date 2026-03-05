// components/ExcelDownloadButton.tsx
'use client';

import { InventoryAnalysisResult } from '@/types/inventory';

interface Props {
  data: InventoryAnalysisResult[];
}

export default function ExcelDownloadButton({ data }: Props) {
  const handleDownload = () => {
    try {
      if (!data || data.length === 0) {
        alert('다운로드할 데이터가 없습니다.');
        return;
      }

      // 1. 엑셀(CSV) 헤더 정의
      const headers = ['플랜트', '분류', '자재코드', '제품명', '수량', '단위', '단가', '총금액', '최종활동일', '미활동일(일)', 'BOM유무', '상태'];

      // 2. 데이터 행 생성 (🚨 어떤 이상한 값이 들어와도 멈추지 않도록 안전망 추가)
      const rows = data.map(item => {
        // 제품명에 포함된 쉼표나 따옴표 때문에 엑셀 셀이 밀리는 현상 완벽 방어
        const safeMaterialName = String(item.materialName || '').replace(/"/g, '""');
        
        return [
          String(item.plant || ''),
          String(item.materialGroup || ''),
          String(item.materialCode || ''),
          `"${safeMaterialName}"`,
          Number(item.currentQuantity || 0),
          String(item.unit || ''),
          Number(item.unitPrice || 0),
          Number(item.totalAmount || 0),
          String(item.lastActivityDate || '-'),
          item.inactiveDays !== null ? Number(item.inactiveDays) : '-',
          item.hasBomUsage ? 'O' : 'X',
          String(item.status || '')
        ];
      });

      // 3. CSV 문자열 결합 및 BOM(한글 깨짐 방지) 추가
      const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');

      // 4. 브라우저에서 파일 다운로드 트리거
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      
      // 다운로드 파일명 생성
      const dateStr = new Date().toISOString().slice(0, 10);
      link.setAttribute('href', url); // 🚨 href 속성 누락 방지
      link.setAttribute('download', `S&OP_재고분석_${dateStr}.csv`);
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

    } catch (error: any) {
      // 만약 에러가 나면 멈추지 않고 화면에 원인을 띄워줍니다!
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