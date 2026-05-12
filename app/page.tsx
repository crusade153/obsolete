// app/page.tsx
import { fetchAvailablePlants, fetchInventoryData, fetchPlanActualData } from '@/actions/inventory';
import { MaterialGroup, PlanActualComparisonResult, ViewType } from '@/types/inventory';
import Link from 'next/link';
import ExcelDownloadButton from '@/components/ExcelDownloadButton';
import SearchBar from '@/components/SearchBar';
import { Suspense } from 'react';

const REFERENCE_DATE_OPTIONS = [
  { label: '2025/11/30', value: '20251130' },
  { label: '2025/12/31', value: '20251231' },
  { label: '2026/01/31', value: '20260131' },
  { label: '2026/02/28', value: '20260228' },
  { label: '2026/03/31', value: '20260331' },
  { label: '2026/04/30', value: '20260430' },
  { label: '2026/05/31', value: '20260531' },
];

const PAGE_SIZE = 50;

type MainTab = 'inventory' | 'plan';
type StatusFilter = 'ALL' | PlanActualComparisonResult['utilizationStatus'];
type PlanPeriodMonths = 12 | 24;

const getDefaultRefDate = () => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());
  const year = parts.find(part => part.type === 'year')?.value;
  const month = parts.find(part => part.type === 'month')?.value;
  const currentMonth = `${year}${month}`;
  const currentMonthOption = REFERENCE_DATE_OPTIONS.find(option => option.value.startsWith(currentMonth));

  return currentMonthOption?.value || REFERENCE_DATE_OPTIONS[REFERENCE_DATE_OPTIONS.length - 1].value;
};

const calcPlanPeriodStartLabel = (refDate: string, periodMonths: PlanPeriodMonths) => {
  const year = Number(refDate.substring(0, 4));
  const month = Number(refDate.substring(4, 6));
  let startMonth = month - (periodMonths - 1);
  let startYear = year;

  while (startMonth <= 0) {
    startMonth += 12;
    startYear -= 1;
  }

  return `${startYear}/${String(startMonth).padStart(2, '0')}/01`;
};

const SortableHeader = ({ title, columnKey, align = 'left', className = '', currentSort, currentOrder, buildUrl }: any) => {
  const isActive = currentSort === columnKey;
  const nextOrder = isActive && currentOrder === 'desc' ? 'asc' : 'desc';

  return (
    <th className={`p-3 font-bold text-${align} cursor-pointer hover:bg-gray-200 transition-colors ${className}`}>
      <Link
        href={buildUrl({ sort: columnKey, order: nextOrder, page: 1 })}
        className="flex items-center justify-center gap-1 w-full"
        style={{ justifyContent: align === 'right' ? 'flex-end' : align === 'left' ? 'flex-start' : 'center' }}
      >
        {title}
        {isActive ? (currentOrder === 'desc' ? <span className="text-blue-600">↓</span> : <span className="text-blue-600">↑</span>) : <span className="text-gray-400 opacity-50">↕</span>}
      </Link>
    </th>
  );
};

const statusStyle: Record<PlanActualComparisonResult['utilizationStatus'], string> = {
  ON_TRACK: 'bg-green-100 text-green-700',
  UNDER: 'bg-orange-100 text-orange-700',
  OVER: 'bg-blue-100 text-blue-700',
  NO_PLAN: 'bg-gray-100 text-gray-500',
};

const statusLabel: Record<PlanActualComparisonResult['utilizationStatus'], string> = {
  ON_TRACK: '계획권',
  UNDER: '미달',
  OVER: '초과',
  NO_PLAN: '계획 없음',
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | undefined }>;
}) {
  const params = await searchParams;
  const currentTab = params.tab === 'plan' ? 'plan' : 'inventory';
  const currentView = (params.view as ViewType) || 'ALL';
  const currentPlant = params.plant || 'ALL';
  const currentGroup = params.group || 'ALL';
  const currentStatus: StatusFilter = ['ON_TRACK', 'UNDER', 'OVER', 'NO_PLAN'].includes(params.status || '')
    ? params.status as StatusFilter
    : 'ALL';
  const currentPlanPeriod: PlanPeriodMonths = params.period === '12' ? 12 : 24;
  const searchKeyword = params.search || '';
  const currentPage = Number(params.page) || 1;
  const defaultRefDate = getDefaultRefDate();
  const currentRefDate = REFERENCE_DATE_OPTIONS.find(o => o.value === params.refDate)?.value || defaultRefDate;
  const planPeriodStartLabel = calcPlanPeriodStartLabel(currentRefDate, currentPlanPeriod);
  const planPeriodEndLabel = `${currentRefDate.substring(0, 4)}/${currentRefDate.substring(4, 6)}/${currentRefDate.substring(6, 8)}`;
  const defaultSort = currentTab === 'plan' ? 'achievementRate' : 'inactiveDays';
  const sortCol = params.sort || defaultSort;
  const sortDir = params.order || 'desc';

  const availablePlants = await fetchAvailablePlants();
  const inventoryResult = currentTab === 'inventory'
    ? await fetchInventoryData(currentPlant, currentGroup, currentView, currentRefDate)
    : null;
  const planResult = currentTab === 'plan'
    ? await fetchPlanActualData(currentPlant, currentGroup, currentView, currentRefDate, currentPlanPeriod)
    : null;

  const activeResult = currentTab === 'inventory' ? inventoryResult : planResult;

  if (!activeResult?.success) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="p-6 bg-white rounded-lg shadow-lg text-center">
          <h2 className="text-2xl font-bold text-red-600 mb-2">데이터 로드 실패</h2>
          <p className="text-gray-600">{activeResult?.error}</p>
        </div>
      </div>
    );
  }

  let inventoryData = inventoryResult?.data || [];
  let planData = planResult?.data || [];

  if (searchKeyword) {
    const lowerSearch = searchKeyword.toLowerCase();
    const matches = (item: { materialCode: string; materialName: string }) =>
      item.materialCode.toLowerCase().includes(lowerSearch) ||
      item.materialName.toLowerCase().includes(lowerSearch);

    inventoryData = inventoryData.filter(matches);
    planData = planData.filter(matches);
  }

  const statusCounts = {
    ALL: planData.length,
    ON_TRACK: planData.filter(item => item.utilizationStatus === 'ON_TRACK').length,
    UNDER: planData.filter(item => item.utilizationStatus === 'UNDER').length,
    OVER: planData.filter(item => item.utilizationStatus === 'OVER').length,
    NO_PLAN: planData.filter(item => item.utilizationStatus === 'NO_PLAN').length,
  };

  if (currentStatus !== 'ALL') {
    planData = planData.filter(item => item.utilizationStatus === currentStatus);
  }

  const activeData = currentTab === 'inventory' ? inventoryData : planData;
  const totalItems = activeData.length;

  const sortData = <T extends Record<string, any>>(rows: T[]) => {
    rows.sort((a, b) => {
      let valA = a[sortCol];
      let valB = b[sortCol];

      if (valA === null || valA === undefined) valA = sortDir === 'asc' ? Infinity : -Infinity;
      if (valB === null || valB === undefined) valB = sortDir === 'asc' ? Infinity : -Infinity;

      if (valA < valB) return sortDir === 'asc' ? -1 : 1;
      if (valA > valB) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  };

  sortData(activeData as any[]);

  const totalPages = Math.max(1, Math.ceil(activeData.length / PAGE_SIZE));
  const paginatedInventoryData = inventoryData.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const paginatedPlanData = planData.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const totalAmount = inventoryData.reduce((sum, item) => sum + item.totalAmount, 0);
  const amount180Days = inventoryData.filter(d => d.inactiveDays !== null && d.inactiveDays >= 180).reduce((sum, d) => sum + d.totalAmount, 0);
  const amount365Days = inventoryData.filter(d => d.inactiveDays !== null && d.inactiveDays >= 365).reduce((sum, d) => sum + d.totalAmount, 0);

  const plannedTotal = planData.reduce((sum, item) => sum + item.plannedQuantity, 0);
  const actualTotal = planData.reduce((sum, item) => sum + item.actualQuantity, 0);
  const achievementTotal = plannedTotal > 0 ? ((actualTotal / plannedTotal) * 100).toFixed(1) : '0.0';
  const underCount = planData.filter(item => item.utilizationStatus === 'UNDER').length;
  const overCount = planData.filter(item => item.utilizationStatus === 'OVER').length;

  const buildUrl = (updates: Record<string, string | number>) => {
    const newParams = new URLSearchParams();
    if (currentTab !== 'inventory') newParams.set('tab', currentTab);
    if (currentRefDate !== defaultRefDate) newParams.set('refDate', currentRefDate);
    if (currentView !== 'ALL') newParams.set('view', currentView);
    if (currentPlant !== 'ALL') newParams.set('plant', currentPlant);
    if (currentGroup !== 'ALL') newParams.set('group', currentGroup);
    if (currentTab === 'plan' && currentStatus !== 'ALL') newParams.set('status', currentStatus);
    if (currentTab === 'plan' && currentPlanPeriod !== 24) newParams.set('period', String(currentPlanPeriod));
    if (sortCol !== defaultSort) newParams.set('sort', sortCol);
    if (sortDir !== 'desc') newParams.set('order', sortDir);
    if (currentPage !== 1) newParams.set('page', String(currentPage));
    if (searchKeyword) newParams.set('search', searchKeyword);

    Object.entries(updates).forEach(([k, v]) => {
      newParams.set(k, String(v));
      if (k === 'status' && v === 'ALL') {
        newParams.delete('status');
      }
      if (k === 'period' && Number(v) === 24) {
        newParams.delete('period');
      }
      if (k === 'tab') {
        newParams.delete('sort');
        newParams.delete('order');
        if (v === 'inventory') {
          newParams.delete('status');
          newParams.delete('period');
        }
      }
    });

    return `/?${newParams.toString()}`;
  };

  const viewTabs = [
    { label: '전체 보기', value: 'ALL' },
    { label: '생산 부문 (원/부/포/반)', value: 'PROD' },
    { label: '물류 부문 (제품/상품)', value: 'LOGIS' },
  ];

  const plantTabs = [
    { label: '전체 플랜트', value: 'ALL' },
    ...availablePlants.map(p => ({ label: `${p} 플랜트`, value: p })),
  ];

  const allGroups = [
    { label: '원자재', value: MaterialGroup.RAW, type: 'PROD' },
    { label: '부자재', value: MaterialGroup.SUB, type: 'PROD' },
    { label: '포장재', value: MaterialGroup.PKG, type: 'PROD' },
    { label: '반제품', value: MaterialGroup.SEMI, type: 'PROD' },
    { label: '제품', value: MaterialGroup.FIN, type: 'LOGIS' },
    { label: '상품', value: MaterialGroup.TRADE, type: 'LOGIS' },
  ];

  const displayGroups = currentView === 'ALL' ? allGroups : allGroups.filter(g => g.type === currentView);
  const groupTabs = [{ label: '전체 분류', value: 'ALL' }, ...displayGroups];
  const statusTabs: Array<{ label: string; value: StatusFilter; count: number }> = [
    { label: '전체 상태', value: 'ALL', count: statusCounts.ALL },
    { label: '계획권', value: 'ON_TRACK', count: statusCounts.ON_TRACK },
    { label: '미달', value: 'UNDER', count: statusCounts.UNDER },
    { label: '초과', value: 'OVER', count: statusCounts.OVER },
    { label: '계획 없음', value: 'NO_PLAN', count: statusCounts.NO_PLAN },
  ];
  const planPeriodTabs: Array<{ label: string; value: PlanPeriodMonths }> = [
    { label: '1년 기준', value: 12 },
    { label: '2년 기준', value: 24 },
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-8 font-sans">
      <div className="max-w-[1500px] mx-auto">
        <header className="mb-6 flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
          <div>
            <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">
              기말재고 기준 재고 인사이트
            </h1>
            <p className="text-gray-500 mt-2">
              현재 재고, 활동 이력, 계획 대비 실적을 같은 품목 기준으로 연결해 봅니다
            </p>
          </div>

          <div className="flex flex-col md:flex-row items-end md:items-center gap-3 w-full md:w-auto">
            <Suspense fallback={<div className="w-full md:w-80 h-10 bg-gray-200 rounded-lg animate-pulse" />}>
              <SearchBar />
            </Suspense>
            <ExcelDownloadButton
              data={currentTab === 'inventory' ? inventoryData : planData}
              mode={currentTab === 'inventory' ? 'inventory' : 'plan'}
            />
          </div>
        </header>

        <div className="mb-6 bg-white p-2 rounded-xl shadow-sm border border-gray-200 inline-flex gap-2">
          {[
            { label: '재고 활동', value: 'inventory' as MainTab },
            { label: '계획 대비 실적', value: 'plan' as MainTab },
          ].map(tab => (
            <Link
              key={tab.value}
              href={buildUrl({ tab: tab.value, page: 1 })}
              className={`px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${
                currentTab === tab.value ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </div>

        <div className="mb-6 bg-amber-50 p-4 rounded-xl shadow-sm border border-amber-200">
          <p className="text-xs font-bold text-amber-700 mb-3 uppercase tracking-wider">
            판단 기준일: 재고 활동은 선택일 기준, 계획 대비 실적은 최근 {currentPlanPeriod}개월({planPeriodStartLabel}~{planPeriodEndLabel}) 기준으로 계산됩니다
          </p>
          <div className="flex flex-wrap gap-2">
            {REFERENCE_DATE_OPTIONS.map((opt) => (
              <Link
                key={opt.value}
                href={buildUrl({ refDate: opt.value, page: 1 })}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                  currentRefDate === opt.value
                    ? 'bg-amber-500 text-white shadow-md ring-2 ring-amber-300'
                    : 'bg-white text-amber-700 border border-amber-300 hover:bg-amber-100'
                }`}
              >
                {opt.label}
              </Link>
            ))}
          </div>
        </div>

        {currentTab === 'plan' && (
          <div className="mb-6 bg-white p-4 rounded-xl shadow-sm border border-gray-200">
            <p className="text-xs font-bold text-gray-400 mb-3 uppercase tracking-wider">계획/실적 기간 선택</p>
            <div className="inline-flex gap-2 rounded-lg bg-gray-100 p-1">
              {planPeriodTabs.map((tab) => (
                <Link
                  key={`period-${tab.value}`}
                  href={buildUrl({ period: tab.value, page: 1 })}
                  className={`px-5 py-2.5 rounded-md text-sm font-bold transition-all ${
                    currentPlanPeriod === tab.value
                      ? 'bg-gray-900 text-white shadow-sm'
                      : 'text-gray-600 hover:bg-white'
                  }`}
                >
                  {tab.label}
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="mb-6 bg-white p-4 rounded-xl shadow-sm border border-gray-200">
          <p className="text-xs font-bold text-gray-400 mb-3 uppercase tracking-wider">Step 1. 부문 선택</p>
          <div className="flex space-x-3 overflow-x-auto">
            {viewTabs.map((tab) => (
              <Link
                key={`view-${tab.value}`}
                href={buildUrl({ view: tab.value, plant: currentPlant, group: 'ALL', page: 1 })}
                className={`px-5 py-3 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${
                  currentView === tab.value
                    ? 'bg-gray-800 text-white shadow-md'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
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
                className={`px-4 py-1.5 rounded-full text-sm font-bold transition-all whitespace-nowrap ${
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

        {currentTab === 'plan' && (
          <div className="mb-8">
            <p className="text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">Step 4. 상태 선택</p>
            <div className="flex flex-wrap gap-2">
              {statusTabs.map((tab) => (
                <Link
                  key={`status-${tab.value}`}
                  href={buildUrl({ status: tab.value, page: 1 })}
                  className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                    currentStatus === tab.value
                      ? 'bg-emerald-600 text-white shadow-md'
                      : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  {tab.label}
                  <span className={`ml-2 text-xs ${currentStatus === tab.value ? 'text-emerald-100' : 'text-gray-400'}`}>
                    {tab.count.toLocaleString('ko-KR')}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {currentTab === 'inventory' ? (
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
            </div>
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 border-l-4 border-l-red-500 bg-red-50/30">
              <p className="text-sm font-bold text-red-700">365일 이상 미출고 금액</p>
              <p className="text-3xl font-black text-red-600 mt-2">₩{amount365Days.toLocaleString('ko-KR')}</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
              <p className="text-sm font-bold text-gray-500">{currentPlanPeriod === 12 ? '1년' : '2년'} 계획 수량</p>
              <p className="text-3xl font-black text-gray-900 mt-2">{plannedTotal.toLocaleString('ko-KR')}</p>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 border-l-4 border-l-blue-500">
              <p className="text-sm font-bold text-gray-500">{currentPlanPeriod === 12 ? '1년' : '2년'} 실적 수량</p>
              <p className="text-3xl font-black text-gray-900 mt-2">{actualTotal.toLocaleString('ko-KR')}</p>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 border-l-4 border-l-green-500 bg-green-50/30">
              <p className="text-sm font-bold text-green-700">전체 달성률</p>
              <p className="text-3xl font-black text-green-700 mt-2">{achievementTotal}%</p>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 border-l-4 border-l-orange-400 bg-orange-50/30">
              <p className="text-sm font-bold text-orange-700">미달/초과 품목</p>
              <p className="text-3xl font-black text-orange-600 mt-2">{underCount.toLocaleString('ko-KR')} / {overCount.toLocaleString('ko-KR')}</p>
            </div>
          </div>
        )}

        <section className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="w-full overflow-x-auto rounded-t-xl">
            {currentTab === 'inventory' ? (
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
                  {paginatedInventoryData.map((item) => (
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
            ) : (
              <table className="w-full text-left border-collapse min-w-max">
                <thead>
                  <tr className="bg-gray-100 text-gray-600 text-xs border-b border-gray-200 uppercase tracking-wider">
                    <SortableHeader title="분류" columnKey="materialGroup" align="left" currentSort={sortCol} currentOrder={sortDir} buildUrl={buildUrl} />
                    <SortableHeader title="자재코드/명" columnKey="materialName" align="left" currentSort={sortCol} currentOrder={sortDir} buildUrl={buildUrl} />
                    <SortableHeader title="현재 재고" columnKey="currentQuantity" align="right" currentSort={sortCol} currentOrder={sortDir} buildUrl={buildUrl} />
                    <SortableHeader title="계획수량" columnKey="plannedQuantity" align="right" currentSort={sortCol} currentOrder={sortDir} buildUrl={buildUrl} />
                    <SortableHeader title="실적수량" columnKey="actualQuantity" align="right" currentSort={sortCol} currentOrder={sortDir} buildUrl={buildUrl} />
                    <SortableHeader title="차이" columnKey="varianceQuantity" align="right" currentSort={sortCol} currentOrder={sortDir} buildUrl={buildUrl} />
                    <SortableHeader title="달성률" columnKey="achievementRate" align="center" className="bg-green-50/50" currentSort={sortCol} currentOrder={sortDir} buildUrl={buildUrl} />
                    <SortableHeader title="남은 계획" columnKey="remainingPlanQuantity" align="right" currentSort={sortCol} currentOrder={sortDir} buildUrl={buildUrl} />
                    <SortableHeader title="재고/계획" columnKey="stockToPlanRate" align="center" currentSort={sortCol} currentOrder={sortDir} buildUrl={buildUrl} />
                    <SortableHeader title="상태" columnKey="utilizationStatus" align="center" currentSort={sortCol} currentOrder={sortDir} buildUrl={buildUrl} />
                  </tr>
                </thead>
                <tbody className="text-sm divide-y divide-gray-100">
                  {paginatedPlanData.map((item) => (
                    <tr key={`${item.plant}-${item.materialCode}`} className="hover:bg-gray-50 transition-colors text-gray-700">
                      <td className="p-3 font-medium text-gray-500 text-xs">{item.plant} / {item.materialGroup}</td>
                      <td className="p-3">
                        <div className="font-mono font-bold text-xs">{item.materialCode}</div>
                        <div className="truncate max-w-[240px] text-xs text-gray-500" title={item.materialName}>{item.materialName}</div>
                      </td>
                      <td className="p-3 text-right">
                        <div className="font-bold text-gray-900">{item.currentQuantity.toLocaleString('ko-KR')}</div>
                        <div className="text-[10px] text-gray-400">{item.unit}</div>
                      </td>
                      <td className="p-3 text-right font-bold">{item.plannedQuantity.toLocaleString('ko-KR')}</td>
                      <td className="p-3 text-right font-bold text-blue-700">{item.actualQuantity.toLocaleString('ko-KR')}</td>
                      <td className={`p-3 text-right font-bold ${item.varianceQuantity < 0 ? 'text-orange-600' : 'text-green-700'}`}>
                        {item.varianceQuantity.toLocaleString('ko-KR')}
                      </td>
                      <td className="p-3 text-center bg-green-50/30">
                        {item.achievementRate === null ? '-' : (
                          <span className={`font-bold ${item.achievementRate < 90 ? 'text-orange-600' : item.achievementRate > 110 ? 'text-blue-700' : 'text-green-700'}`}>
                            {item.achievementRate}%
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-right">{item.remainingPlanQuantity.toLocaleString('ko-KR')}</td>
                      <td className="p-3 text-center">{item.stockToPlanRate === null ? '-' : `${item.stockToPlanRate}%`}</td>
                      <td className="p-3 text-center">
                        <span className={`font-bold px-2 py-1 rounded ${statusStyle[item.utilizationStatus]}`}>
                          {statusLabel[item.utilizationStatus]}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {activeData.length === 0 && (
              <div className="p-12 flex flex-col items-center justify-center text-gray-500 bg-gray-50/50">
                <span className="text-4xl mb-3">검색</span>
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
        </section>
      </div>
    </div>
  );
}
