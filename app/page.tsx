// app/page.tsx
import { fetchInventoryData, fetchAvailablePlants } from '@/actions/inventory';
import { MaterialGroup } from '@/types/inventory';
import Link from 'next/link';
import ExcelDownloadButton from '@/components/ExcelDownloadButton'; // 엑셀 버튼 가져오기

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | undefined }>;
}) {
  const params = await searchParams;
  const currentPlant = params.plant || 'ALL';
  const currentGroup = params.group || 'ALL';
  
  const availablePlants = await fetchAvailablePlants();
  const result = await fetchInventoryData(currentPlant, currentGroup);
  
  if (!result.success) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="p-6 bg-white rounded-lg shadow-lg text-center">
          <h2 className="text-2xl font-bold text-red-600 mb-2">분석 로드 실패</h2>
          <p className="text-gray-600">{result.error}</p>
        </div>
      </div>
    );
  }

  let data = result.data || [];

  data.sort((a, b) => {
    const statusScore: Record<string, number> = { '불용': 1, '부진': 2, '정상': 3, '분석불가': 4 };
    const scoreA = statusScore[a.status] || 5;
    const scoreB = statusScore[b.status] || 5;
    
    if (scoreA !== scoreB) {
      return scoreA - scoreB; 
    }
    return b.totalAmount - a.totalAmount; 
  });

  const totalItems = data.length;
  const totalAmount = data.reduce((sum, item) => sum + item.totalAmount, 0);
  const obsoleteCount = data.filter(item => item.status === '불용').length;
  const slowMovingCount = data.filter(item => item.status === '부진').length;

  const plantTabs = [
    { label: '전체 플랜트', value: 'ALL' },
    ...availablePlants.map(p => ({ label: `${p} 플랜트`, value: p }))
  ];

  const groupTabs = [
    { label: '전체 분류', value: 'ALL' },
    { label: '원자재', value: MaterialGroup.RAW },
    { label: '부자재', value: MaterialGroup.SUB },
    { label: '포장재', value: MaterialGroup.PKG },
    { label: '반제품', value: MaterialGroup.SEMI },
    { label: '제품', value: MaterialGroup.FIN },
    { label: '상품', value: MaterialGroup.TRADE },
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-8 font-sans">
      <div className="max-w-7xl mx-auto">
        <header className="mb-6 flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">
              📦 기말재고 S&OP 분석 대시보드
            </h1>
            <p className="text-gray-500 mt-2">
              플랜트 및 자재 그룹별 부진/불용 현황 (동적 다중 필터링)
            </p>
          </div>
          
          {/* ✅ 여기에 엑셀 다운로드 버튼 컴포넌트 삽입 (현재 필터링된 데이터 100% 전달) */}
          <ExcelDownloadButton data={data} />
        </header>

        {/* --- 1단계 필터: 플랜트 선택 --- */}
        <div className="mb-4">
          <p className="text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">Step 1. 플랜트 선택</p>
          <div className="flex space-x-2 overflow-x-auto pb-2">
            {plantTabs.map((tab) => (
              <Link
                key={`plant-${tab.value}`}
                href={`/?plant=${tab.value}&group=${currentGroup}`}
                className={`px-4 py-1.5 rounded-full text-sm font-bold transition-all ${
                  currentPlant === tab.value
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-100'
                }`}
              >
                {tab.label}
              </Link>
            ))}
          </div>
        </div>

        {/* --- 2단계 필터: 자재그룹 선택 --- */}
        <div className="mb-8">
          <p className="text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">Step 2. 분류 선택</p>
          <div className="flex space-x-2 overflow-x-auto pb-2 border-b border-gray-200">
            {groupTabs.map((tab) => (
              <Link
                key={`group-${tab.value}`}
                href={`/?plant=${currentPlant}&group=${tab.value}`}
                className={`px-5 py-2.5 text-sm font-bold border-b-2 transition-colors whitespace-nowrap ${
                  currentGroup === tab.value
                    ? 'border-blue-600 text-blue-600 bg-blue-50/50 rounded-t-lg'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-t-lg'
                }`}
              >
                {tab.label}
              </Link>
            ))}
          </div>
        </div>

        {/* --- 동적 KPI 요약 카드 섹션 --- */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 transition-all hover:shadow-md">
            <p className="text-sm font-bold text-gray-500">조회된 품목 수</p>
            <p className="text-3xl font-black text-gray-900 mt-2">{totalItems.toLocaleString()} <span className="text-lg font-medium text-gray-500">건</span></p>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 transition-all hover:shadow-md">
            <p className="text-sm font-bold text-gray-500">조회된 재고 금액</p>
            <p className="text-3xl font-black text-blue-600 mt-2">
              ₩{totalAmount.toLocaleString()}
            </p>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 transition-all hover:shadow-md">
            <p className="text-sm font-bold text-gray-500">부진 재고 (180일+ & BOM O)</p>
            <p className="text-3xl font-black text-orange-500 mt-2">{slowMovingCount.toLocaleString()} <span className="text-lg font-medium text-gray-500">건</span></p>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 transition-all hover:shadow-md">
            <p className="text-sm font-bold text-gray-500">불용 재고 (180일+ & BOM X)</p>
            <p className="text-3xl font-black text-red-600 mt-2">{obsoleteCount.toLocaleString()} <span className="text-lg font-medium text-gray-500">건</span></p>
          </div>
        </div>

        {/* --- 데이터 테이블 섹션 --- */}
        <div key={`${currentPlant}-${currentGroup}`} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto w-full">
            <table className="w-full text-left border-collapse min-w-max">
              <thead>
                <tr className="bg-gray-100 text-gray-600 text-sm border-b border-gray-200">
                  <th className="p-4 font-bold">플랜트</th>
                  <th className="p-4 font-bold">분류</th>
                  <th className="p-4 font-bold">자재코드</th>
                  <th className="p-4 font-bold">제품명</th>
                  <th className="p-4 font-bold text-right">수량</th>
                  <th className="p-4 font-bold text-right">금액</th>
                  <th className="p-4 font-bold text-center">최종 활동일</th>
                  <th className="p-4 font-bold text-center">미활동일</th>
                  <th className="p-4 font-bold text-center">BOM</th>
                  <th className="p-4 font-bold text-center">상태</th>
                </tr>
              </thead>
              <tbody className="text-sm divide-y divide-gray-100">
                {data.slice(0, 50).map((item) => (
                  <tr key={`${item.plant}-${item.storageLocation}-${item.materialCode}`} className="hover:bg-blue-50/30 transition-colors text-gray-700">
                    <td className="p-4 font-bold text-indigo-500">{item.plant}</td>
                    <td className="p-4 font-medium text-gray-500">{item.materialGroup}</td>
                    <td className="p-4 font-mono font-bold">{item.materialCode}</td>
                    <td className="p-4 truncate max-w-xs font-medium" title={item.materialName}>{item.materialName}</td>
                    <td className="p-4 text-right">{item.currentQuantity.toLocaleString()} <span className="text-xs text-gray-400">{item.unit}</span></td>
                    <td className="p-4 text-right font-bold text-gray-900">₩{item.totalAmount.toLocaleString()}</td>
                    <td className="p-4 text-center text-gray-500">{item.lastActivityDate || '-'}</td>
                    <td className="p-4 text-center">
                      {item.inactiveDays !== null ? <span className="font-bold">{item.inactiveDays}일</span> : '-'}
                    </td>
                    <td className="p-4 text-center">
                      {item.hasBomUsage ? <span className="text-green-600 font-bold bg-green-100 px-2 py-0.5 rounded">O</span> : <span className="text-red-400 font-medium">X</span>}
                    </td>
                    <td className="p-4 text-center">
                      <span className={`px-3 py-1.5 rounded-md text-xs font-black shadow-sm ${
                        item.status === '불용' ? 'bg-red-500 text-white' :
                        item.status === '부진' ? 'bg-orange-400 text-white' :
                        item.status === '정상' ? 'bg-green-100 text-green-700' :
                        'bg-gray-100 text-gray-500'
                      }`}>
                        {item.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.length > 50 && (
            <div className="p-4 text-center text-sm font-medium text-blue-600 bg-blue-50/50 border-t border-gray-100">
              * 성능 최적화를 위해 상위 50건만 미리보기로 표시됩니다. (총 {data.length}건 정렬 완료)
            </div>
          )}
        </div>
      </div>
    </div>
  );
}