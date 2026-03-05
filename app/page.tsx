// app/page.tsx
import { fetchInventoryData, fetchAvailablePlants } from '@/actions/inventory';
import { MaterialGroup, ViewType } from '@/types/inventory';
import Link from 'next/link';
import ExcelDownloadButton from '@/components/ExcelDownloadButton';

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | undefined }>;
}) {
  const params = await searchParams;
  const currentView = (params.view as ViewType) || 'ALL';
  const currentPlant = params.plant || 'ALL';
  const currentGroup = params.group || 'ALL';
  
  const availablePlants = await fetchAvailablePlants();
  const result = await fetchInventoryData(currentPlant, currentGroup, currentView);
  
  if (!result.success) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="p-6 bg-white rounded-lg shadow-lg text-center">
          <h2 className="text-2xl font-bold text-red-600 mb-2">데이터 로드 실패</h2>
          <p className="text-gray-600">{result.error}</p>
        </div>
      </div>
    );
  }

  let data = result.data || [];

  // 💡 정렬 기준: 미활동일이 가장 긴(오래된) 악성 재고부터, 금액이 큰 순서로 정렬
  data.sort((a, b) => {
    const daysA = a.inactiveDays ?? -1;
    const daysB = b.inactiveDays ?? -1;
    if (daysA !== daysB) {
      return daysB - daysA; 
    }
    return b.totalAmount - a.totalAmount; 
  });

  const totalItems = data.length;
  const totalAmount = data.reduce((sum, item) => sum + item.totalAmount, 0);
  
  // 💡 팩트 기반 KPI 계산
  const amount180Days = data.filter(d => d.inactiveDays !== null && d.inactiveDays >= 180).reduce((sum, d) => sum + d.totalAmount, 0);
  const amount365Days = data.filter(d => d.inactiveDays !== null && d.inactiveDays >= 365).reduce((sum, d) => sum + d.totalAmount, 0);

  // 🚀 1. 부문(View) 탭
  const viewTabs = [
    { label: '전체 보기', value: 'ALL', icon: '🌐' },
    { label: '생산 부문 (원/부/포/반)', value: 'PROD', icon: '🏭' },
    { label: '물류 부문 (제품/상품)', value: 'LOGIS', icon: '🚛' },
  ];

  // 🚀 2. 플랜트 탭
  const plantTabs = [
    { label: '전체 플랜트', value: 'ALL' },
    ...availablePlants.map(p => ({ label: `${p} 플랜트`, value: p }))
  ];

  // 🚀 3. 분류 탭 (부문 선택에 따라 동적으로 노출)
  const allGroups = [
    { label: '원자재', value: MaterialGroup.RAW, type: 'PROD' },
    { label: '부자재', value: MaterialGroup.SUB, type: 'PROD' },
    { label: '포장재', value: MaterialGroup.PKG, type: 'PROD' },
    { label: '반제품', value: MaterialGroup.SEMI, type: 'PROD' },
    { label: '제품', value: MaterialGroup.FIN, type: 'LOGIS' },
    { label: '상품', value: MaterialGroup.TRADE, type: 'LOGIS' },
  ];

  const displayGroups = currentView === 'ALL' 
    ? allGroups 
    : allGroups.filter(g => g.type === currentView);

  const groupTabs = [
    { label: '전체 분류', value: 'ALL' },
    ...displayGroups
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-8 font-sans">
      <div className="max-w-[1500px] mx-auto">
        <header className="mb-6 flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">
              📦 기말재고 기준 재고 활동 히스토리
            </h1>
            <p className="text-gray-500 mt-2">
              주관적 판단을 배제한 100% 데이터(팩트) 기반 장기 체화 및 회전율 분석
            </p>
          </div>
          
          <ExcelDownloadButton data={data} />
        </header>

        {/* 🚀 STEP 1: 부문 선택 (생산 vs 물류) */}
        <div className="mb-6 bg-white p-4 rounded-xl shadow-sm border border-gray-200">
          <p className="text-xs font-bold text-gray-400 mb-3 uppercase tracking-wider">Step 1. 부문 선택</p>
          <div className="flex space-x-3 overflow-x-auto">
            {viewTabs.map((tab) => (
              <Link
                key={`view-${tab.value}`}
                href={`/?view=${tab.value}&plant=${currentPlant}&group=ALL`}
                className={`px-5 py-3 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${
                  currentView === tab.value
                    ? 'bg-gray-800 text-white shadow-md'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <span>{tab.icon}</span>
                {tab.label}
              </Link>
            ))}
          </div>
        </div>

        {/* 🚀 STEP 2: 플랜트 선택 */}
        <div className="mb-4">
          <p className="text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">Step 2. 플랜트 선택</p>
          <div className="flex space-x-2 overflow-x-auto pb-2">
            {plantTabs.map((tab) => (
              <Link
                key={`plant-${tab.value}`}
                href={`/?view=${currentView}&plant=${tab.value}&group=${currentGroup}`}
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

        {/* 🚀 STEP 3: 분류 선택 (동적 렌더링) */}
        <div className="mb-8">
          <p className="text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">Step 3. 분류 선택</p>
          <div className="flex space-x-2 overflow-x-auto pb-2 border-b border-gray-200">
            {groupTabs.map((tab) => (
              <Link
                key={`group-${tab.value}`}
                href={`/?view=${currentView}&plant=${currentPlant}&group=${tab.value}`}
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

        {/* --- 팩트 기반 KPI 요약 카드 섹션 --- */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <p className="text-sm font-bold text-gray-500">조회 품목 수</p>
            {/* 💡 toLocaleString('ko-KR') 적용 완료 */}
            <p className="text-3xl font-black text-gray-900 mt-2">{totalItems.toLocaleString('ko-KR')} <span className="text-lg font-medium text-gray-500">건</span></p>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 border-l-4 border-l-blue-500">
            <p className="text-sm font-bold text-gray-500">총 재고 금액</p>
            <p className="text-3xl font-black text-gray-900 mt-2">
              ₩{totalAmount.toLocaleString('ko-KR')}
            </p>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 border-l-4 border-l-orange-400 bg-orange-50/30">
            <p className="text-sm font-bold text-orange-700">180일 이상 미출고 금액</p>
            <p className="text-3xl font-black text-orange-600 mt-2">
              ₩{amount180Days.toLocaleString('ko-KR')}
            </p>
            <p className="text-xs text-gray-500 mt-1">전체 대비 {totalAmount > 0 ? ((amount180Days / totalAmount) * 100).toFixed(1) : '0.0'}%</p>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 border-l-4 border-l-red-500 bg-red-50/30">
            <p className="text-sm font-bold text-red-700">365일 이상 미출고 금액</p>
            <p className="text-3xl font-black text-red-600 mt-2">
              ₩{amount365Days.toLocaleString('ko-KR')}
            </p>
            <p className="text-xs text-gray-500 mt-1">전체 대비 {totalAmount > 0 ? ((amount365Days / totalAmount) * 100).toFixed(1) : '0.0'}%</p>
          </div>
        </div>

        {/* --- 데이터 테이블 섹션 --- */}
        {/* 💡 Hydration Error를 일으켰던 불필요한 DOM key 속성 제거 완벽 조치 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto w-full">
            <table className="w-full text-left border-collapse min-w-max">
              <thead>
                <tr className="bg-gray-100 text-gray-600 text-xs border-b border-gray-200 uppercase tracking-wider">
                  <th className="p-3 font-bold">분류</th>
                  <th className="p-3 font-bold">자재코드/명</th>
                  <th className="p-3 font-bold text-right">현재 재고(금액)</th>
                  <th className="p-3 font-bold text-center">최초 입고일</th>
                  <th className="p-3 font-bold text-right">최근 입고 (수량)</th>
                  <th className="p-3 font-bold text-center">마지막 출고일</th>
                  <th className="p-3 font-bold text-right bg-blue-50/50">최근6개월출고(월평균)</th>
                  <th className="p-3 font-bold text-center">회전(월)</th>
                  <th className="p-3 font-bold text-center bg-red-50/50">미활동(일)</th>
                  <th className="p-3 font-bold text-center">BOM</th>
                </tr>
              </thead>
              <tbody className="text-sm divide-y divide-gray-100">
                {data.slice(0, 100).map((item) => (
                  <tr key={`${item.plant}-${item.storageLocation}-${item.materialCode}`} className="hover:bg-gray-50 transition-colors text-gray-700">
                    <td className="p-3 font-medium text-gray-500 text-xs">{item.plant} / {item.materialGroup}</td>
                    <td className="p-3">
                      <div className="font-mono font-bold text-xs">{item.materialCode}</div>
                      <div className="truncate max-w-[200px] text-xs text-gray-500" title={item.materialName}>{item.materialName}</div>
                    </td>
                    <td className="p-3 text-right">
                      <div className="font-bold text-gray-900">{item.currentQuantity.toLocaleString('ko-KR')} <span className="text-[10px] font-normal text-gray-400">{item.unit}</span></div>
                      <div className="text-xs text-gray-500">₩{item.totalAmount.toLocaleString('ko-KR')}</div>
                    </td>
                    <td className="p-3 text-center text-gray-500 text-xs">{item.firstReceiptDate || '-'}</td>
                    <td className="p-3 text-right text-xs">
                      <div>{item.lastReceiptDate || '-'}</div>
                      {item.lastReceiptQty > 0 && <div className="text-gray-400">({item.lastReceiptQty.toLocaleString('ko-KR')} {item.unit})</div>}
                    </td>
                    <td className="p-3 text-center text-blue-600 font-semibold text-xs">{item.lastIssueDate || '-'}</td>
                    
                    <td className="p-3 text-right text-xs bg-blue-50/30">
                      {item.last6MonthsIssueQty > 0 ? (
                        <>
                          <div className="font-bold text-gray-800">{item.last6MonthsIssueQty.toLocaleString('ko-KR')}</div>
                          <div className="text-gray-400">(월평균 {item.monthlyAvgIssueQty.toLocaleString('ko-KR')})</div>
                        </>
                      ) : '-'}
                    </td>
                    
                    <td className="p-3 text-center text-xs">
                      {item.coverageMonths !== null ? (
                        <span className={`font-bold px-2 py-1 rounded ${item.coverageMonths === 999 ? 'bg-red-100 text-red-700' : item.coverageMonths > 6 ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'}`}>
                          {item.coverageMonths === 999 ? '∞ (출고없음)' : `${item.coverageMonths}개월`}
                        </span>
                      ) : '-'}
                    </td>

                    <td className="p-3 text-center text-xs bg-red-50/30">
                      {item.inactiveDays !== null ? (
                         <span className={`font-bold ${item.inactiveDays >= 365 ? 'text-red-600' : item.inactiveDays >= 180 ? 'text-orange-500' : 'text-gray-700'}`}>
                           {item.inactiveDays}일
                         </span>
                      ) : '-'}
                    </td>
                    
                    <td className="p-3 text-center text-xs">
                      {item.bomStatus === 'O' && <span className="text-green-700 font-bold bg-green-100 px-2 py-1 rounded">O</span>}
                      {item.bomStatus === 'X' && <span className="text-red-600 font-bold bg-red-100 px-2 py-1 rounded">X</span>}
                      {item.bomStatus === 'N/A' && <span className="text-gray-400 font-medium">N/A</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.length > 100 && (
            <div className="p-4 text-center text-sm font-medium text-gray-500 bg-gray-50 border-t border-gray-200">
              * 미활동일이 가장 오래된 악성 재고 상위 100건만 렌더링되었습니다. (전체 {data.length.toLocaleString('ko-KR')}건은 엑셀 다운로드로 확인하세요)
            </div>
          )}
        </div>
      </div>
    </div>
  );
}