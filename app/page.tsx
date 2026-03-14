// app/page.tsx
import { fetchInventoryData, fetchAvailablePlants } from '@/actions/inventory';
import { MaterialGroup, ViewType } from '@/types/inventory';
import Link from 'next/link';
import ExcelDownloadButton from '@/components/ExcelDownloadButton';
import SearchBar from '@/components/SearchBar'; 
import { Suspense } from 'react'; // 🚀 Hydration 에러 수정을 위해 추가

// 🚀 Hydration 이슈를 예방하기 위해 SortableHeader를 별도의 컴포넌트로 명확히 분리
const SortableHeader = ({ title, columnKey, align = 'left', className = '', currentSort, currentOrder, buildUrl }: any) => {
  const isActive = currentSort === columnKey;
  const nextOrder = isActive && currentOrder === 'desc' ? 'asc' : 'desc';
  
  return (
    <th className={`p-3 font-bold text-${align} cursor-pointer hover:bg-gray-200 transition-colors ${className}`}>
      <Link href={buildUrl({ sort: columnKey, order: nextOrder, page: 1 })} className="flex items-center justify-center gap-1 w-full" style={{ justifyContent: align === 'right' ? 'flex-end' : align === 'left' ? 'flex-start' : 'center' }}>
        {title}
        {isActive ? (currentOrder === 'desc' ? <span className="text-blue-600">↓</span> : <span className="text-blue-600">↑</span>) : <span className="text-gray-400 opacity-50">↕</span>}
      </Link>
    </th>
  );
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | undefined }>;
}) {
  const params = await searchParams;
  const currentView = (params.view as ViewType) || 'ALL';
  const currentPlant = params.plant || 'ALL';
  const currentGroup = params.group || 'ALL';
  
  const sortCol = params.sort || 'inactiveDays';
  const sortDir = params.order || 'desc';
  const currentPage = Number(params.page) || 1;
  const searchKeyword = params.search || ''; 
  const PAGE_SIZE = 50; 
  
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

  if (searchKeyword) {
    const lowerSearch = searchKeyword.toLowerCase();
    data = data.filter(item => 
      item.materialCode.toLowerCase().includes(lowerSearch) || 
      item.materialName.toLowerCase().includes(lowerSearch)
    );
  }

  const totalItems = data.length;
  const totalAmount = data.reduce((sum, item) => sum + item.totalAmount, 0);
  const amount180Days = data.filter(d => d.inactiveDays !== null && d.inactiveDays >= 180).reduce((sum, d) => sum + d.totalAmount, 0);
  const amount365Days = data.filter(d => d.inactiveDays !== null && d.inactiveDays >= 365).reduce((sum, d) => sum + d.totalAmount, 0);

  data.sort((a: any, b: any) => {
    let valA = a[sortCol];
    let valB = b[sortCol];

    if (valA === null || valA === undefined) valA = sortDir === 'asc' ? Infinity : -Infinity;
    if (valB === null || valB === undefined) valB = sortDir === 'asc' ? Infinity : -Infinity;

    if (valA < valB) return sortDir === 'asc' ? -1 : 1;
    if (valA > valB) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  const totalPages = Math.max(1, Math.ceil(data.length / PAGE_SIZE));
  const paginatedData = data.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const buildUrl = (updates: Record<string, string | number>) => {
    const newParams = new URLSearchParams();
    if (currentView !== 'ALL') newParams.set('view', currentView);
    if (currentPlant !== 'ALL') newParams.set('plant', currentPlant);
    if (currentGroup !== 'ALL') newParams.set('group', currentGroup);
    if (sortCol !== 'inactiveDays') newParams.set('sort', sortCol);
    if (sortDir !== 'desc') newParams.set('order', sortDir);
    if (currentPage !== 1) newParams.set('page', String(currentPage));
    if (searchKeyword) newParams.set('search', searchKeyword); 

    Object.entries(updates).forEach(([k, v]) => newParams.set(k, String(v)));
    return `/?${newParams.toString()}`;
  };

  const viewTabs = [
    { label: '전체 보기', value: 'ALL', icon: '🌐' },
    { label: '생산 부문 (원/부/포/반)', value: 'PROD', icon: '🏭' },
    { label: '물류 부문 (제품/상품)', value: 'LOGIS', icon: '🚛' },
  ];

  const plantTabs = [
    { label: '전체 플랜트', value: 'ALL' },
    ...availablePlants.map(p => ({ label: `${p} 플랜트`, value: p }))
  ];

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
        
        <header className="mb-6 flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
          <div>
            <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">
              📦 기말재고 기준 재고 활동 히스토리
            </h1>
            <p className="text-gray-500 mt-2">
              주관적 판단을 배제한 100% 데이터(팩트) 기반 장기 체화 및 회전율 분석
            </p>
          </div>
          
          <div className="flex flex-col md:flex-row items-end md:items-center gap-3 w-full md:w-auto">
            {/* 🚀 useSearchParams를 쓰는 클라이언트 컴포넌트는 반드시 Suspense로 감싸야 Hydration 에러가 나지 않습니다 */}
            <Suspense fallback={<div className="w-full md:w-80 h-10 bg-gray-200 rounded-lg animate-pulse" />}>
              <SearchBar />
            </Suspense>
            <ExcelDownloadButton data={data} />
          </div>
        </header>

        <div className="mb-6 bg-white p-4 rounded-xl shadow-sm border border-gray-200">
          <p className="text-xs font-bold text-gray-400 mb-3 uppercase tracking-wider">Step 1. 부문 선택</p>
          <div className="flex space-x-3 overflow-x-auto">
            {viewTabs.map((tab) => (
              <Link
                key={`view-${tab.value}`}
                href={buildUrl({ view: tab.value, plant: currentPlant, group: 'ALL', page: 1 })}
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

        <div className="mb-4">
          <p className="text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">Step 2. 플랜트 선택</p>
          <div className="flex space-x-2 overflow-x-auto pb-2">
            {plantTabs.map((tab) => (
              <Link
                key={`plant-${tab.value}`}
                href={buildUrl({ plant: tab.value, page: 1 })}
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

        <div className="mb-8">
          <p className="text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">Step 3. 분류 선택</p>
          <div className="flex space-x-2 overflow-x-auto pb-2 border-b border-gray-200">
            {groupTabs.map((tab) => (
              <Link
                key={`group-${tab.value}`}
                href={buildUrl({ group: tab.value, page: 1 })}
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

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <p className="text-sm font-bold text-gray-500">조회 품목 수</p>
            <p className="text-3xl font-black text-gray-900 mt-2">{totalItems.toLocaleString('ko-KR')} <span className="text-lg font-medium text-gray-500">건</span></p>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 border-l-4 border-l-blue-500">
            <p className="text-sm font-bold text-gray-500">총 재고 금액</p>
            <p className="text-3xl font-black text-gray-900 mt-2">₩{totalAmount.toLocaleString('ko-KR')}</p>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 border-l-4 border-l-orange-400 bg-orange-50/30">
            <p className="text-sm font-bold text-orange-700">180일 이상 미출고 금액</p>
            <p className="text-3xl font-black text-orange-600 mt-2">₩{amount180Days.toLocaleString('ko-KR')}</p>
            <p className="text-xs text-gray-500 mt-1">전체 대비 {totalAmount > 0 ? ((amount180Days / totalAmount) * 100).toFixed(1) : '0.0'}%</p>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 border-l-4 border-l-red-500 bg-red-50/30">
            <p className="text-sm font-bold text-red-700">365일 이상 미출고 금액</p>
            <p className="text-3xl font-black text-red-600 mt-2">₩{amount365Days.toLocaleString('ko-KR')}</p>
            <p className="text-xs text-gray-500 mt-1">전체 대비 {totalAmount > 0 ? ((amount365Days / totalAmount) * 100).toFixed(1) : '0.0'}%</p>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto w-full">
            <table className="w-full text-left border-collapse min-w-max">
              <thead>
                <tr className="bg-gray-100 text-gray-600 text-xs border-b border-gray-200 uppercase tracking-wider">
                  <SortableHeader title="분류" columnKey="materialGroup" align="left" currentSort={sortCol} currentOrder={sortDir} buildUrl={buildUrl} />
                  <SortableHeader title="자재코드/명" columnKey="materialName" align="left" currentSort={sortCol} currentOrder={sortDir} buildUrl={buildUrl} />
                  <SortableHeader title="현재 재고(금액)" columnKey="totalAmount" align="right" currentSort={sortCol} currentOrder={sortDir} buildUrl={buildUrl} />
                  <SortableHeader title="최초 입고일" columnKey="firstReceiptDate" align="center" currentSort={sortCol} currentOrder={sortDir} buildUrl={buildUrl} />
                  <SortableHeader title="최근 입고 (수량)" columnKey="lastReceiptDate" align="right" currentSort={sortCol} currentOrder={sortDir} buildUrl={buildUrl} />
                  <SortableHeader title="마지막 출고 (수량)" columnKey="lastIssueDate" align="right" currentSort={sortCol} currentOrder={sortDir} buildUrl={buildUrl} />
                  <SortableHeader title="최근6개월출고(월평균)" columnKey="last6MonthsIssueQty" align="right" className="bg-blue-50/50" currentSort={sortCol} currentOrder={sortDir} buildUrl={buildUrl} />
                  <SortableHeader title="회전(월)" columnKey="coverageMonths" align="center" currentSort={sortCol} currentOrder={sortDir} buildUrl={buildUrl} />
                  <SortableHeader title="미활동(일)" columnKey="inactiveDays" align="center" className="bg-red-50/50" currentSort={sortCol} currentOrder={sortDir} buildUrl={buildUrl} />
                  <SortableHeader title="BOM" columnKey="bomStatus" align="center" currentSort={sortCol} currentOrder={sortDir} buildUrl={buildUrl} />
                </tr>
              </thead>
              <tbody className="text-sm divide-y divide-gray-100">
                {paginatedData.map((item) => (
                  <tr key={`${item.plant}-${item.materialCode}`} className="hover:bg-gray-50 transition-colors text-gray-700">
                    <td className="p-3 font-medium text-gray-500 text-xs">{item.plant} / {item.materialGroup}</td>
                    <td className="p-3">
                      <div className="font-mono font-bold text-xs">{item.materialCode}</div>
                      <div className="truncate max-w-[200px] text-xs text-gray-500" title={item.materialName}>{item.materialName}</div>
                      {item.storageLocation === '통합' && <span className="inline-block mt-1 bg-gray-200 text-gray-600 text-[10px] px-1.5 py-0.5 rounded">위치 통합</span>}
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
                    <td className="p-3 text-right text-xs">
                      <div className="text-blue-600 font-semibold">{item.lastIssueDate || '-'}</div>
                      {item.lastIssueQty > 0 && <div className="text-gray-400">({item.lastIssueQty.toLocaleString('ko-KR')} {item.unit})</div>}
                    </td>
                    
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
                          {item.coverageMonths === 999 ? '∞' : `${item.coverageMonths}개월`}
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
            
            {paginatedData.length === 0 && (
              <div className="p-12 flex flex-col items-center justify-center text-gray-500 bg-gray-50/50">
                <span className="text-4xl mb-3">🔍</span>
                <p className="font-bold text-lg">"{searchKeyword}" 검색 결과가 없습니다.</p>
                <p className="text-sm mt-1">다른 자재코드나 명칭으로 검색해 보세요.</p>
              </div>
            )}
          </div>
          
          {totalPages > 1 && (
            <div className="px-6 py-4 flex items-center justify-between border-t border-gray-200 bg-gray-50">
              <span className="text-sm text-gray-600">
                전체 <strong>{totalItems.toLocaleString('ko-KR')}</strong>건 중 <span className="font-semibold text-gray-900">{currentPage}</span> / {totalPages} 페이지
              </span>
              <div className="flex gap-2">
                {currentPage > 1 ? (
                  <Link href={buildUrl({ page: currentPage - 1 })} className="px-4 py-2 border border-gray-300 rounded-md bg-white text-gray-700 text-sm font-medium hover:bg-gray-100 transition-colors">
                    이전
                  </Link>
                ) : (
                  <button disabled className="px-4 py-2 border border-gray-200 rounded-md bg-gray-100 text-gray-400 text-sm font-medium cursor-not-allowed">이전</button>
                )}
                
                {currentPage < totalPages ? (
                  <Link href={buildUrl({ page: currentPage + 1 })} className="px-4 py-2 border border-gray-300 rounded-md bg-white text-gray-700 text-sm font-medium hover:bg-gray-100 transition-colors">
                    다음
                  </Link>
                ) : (
                  <button disabled className="px-4 py-2 border border-gray-200 rounded-md bg-gray-100 text-gray-400 text-sm font-medium cursor-not-allowed">다음</button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}