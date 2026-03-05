// actions/inventory.ts
'use server';

import { supabase } from '@/lib/supabase';
import { bigquery } from '@/lib/bigquery';
import { InventoryAnalysisResult, MaterialGroup, ViewType } from '@/types/inventory';

const getGroupName = (code: string) => {
  switch (code) {
    case MaterialGroup.RAW: return '원자재';
    case MaterialGroup.SUB: return '부자재';
    case MaterialGroup.PKG: return '포장재';
    case MaterialGroup.SEMI: return '반제품';
    case MaterialGroup.FIN: return '제품';
    case MaterialGroup.TRADE: return '상품';
    default: return '기타';
  }
};

export async function fetchAvailablePlants(): Promise<string[]> {
  try {
    let allPlants: string[] = [];
    let isFetching = true;
    let step = 0;
    const limit = 1000;

    while (isFetching) {
      const from = step * limit;
      const to = from + limit - 1;
      const { data, error } = await supabase.from('ending_inventory').select('plant').range(from, to);
      
      if (error) throw error;
      
      if (data && data.length > 0) {
        allPlants = allPlants.concat(data.map(d => d.plant));
        step++;
        if (data.length < limit) isFetching = false;
      } else {
        isFetching = false;
      }
    }

    const uniquePlants = Array.from(new Set(allPlants.filter(Boolean)));
    return uniquePlants.sort();
  } catch (error) {
    console.error('[ERROR] fetchAvailablePlants:', error);
    return [];
  }
}

export async function fetchInventoryData(
  plantFilter?: string, 
  groupFilter?: string, 
  viewFilter?: string // 🚀 새로 추가된 부문 필터 파라미터
): Promise<{ success: boolean; data?: InventoryAnalysisResult[]; error?: string }> {
  try {
    let allData: any[] = [];
    let isFetching = true;
    let step = 0;
    const limit = 1000;

    while (isFetching) {
      const from = step * limit;
      const to = from + limit - 1;

      let query = supabase.from('ending_inventory').select('*').range(from, to);
      
      if (plantFilter && plantFilter !== 'ALL') {
        query = query.eq('plant', plantFilter);
      }

      // 💡 3단계 필터링 로직: 하위 그룹 선택 시 구체적 코드 적용, 없을 시 부문 필터 적용
      if (groupFilter && groupFilter !== 'ALL') {
        query = query.like('material_code', `${groupFilter}%`);
      } else if (viewFilter === 'PROD') {
        // 생산 부문: 1, 2, 3, 4로 시작하는 자재만
        query = query.or('material_code.like.1%,material_code.like.2%,material_code.like.3%,material_code.like.4%');
      } else if (viewFilter === 'LOGIS') {
        // 물류 부문: 5, 6으로 시작하는 제품/상품만
        query = query.or('material_code.like.5%,material_code.like.6%');
      }

      const { data, error } = await query;
      if (error) throw error;

      if (data && data.length > 0) {
        allData = allData.concat(data);
        step++;
        if (data.length < limit) isFetching = false;
      } else {
        isFetching = false;
      }
    }

    if (allData.length === 0) return { success: true, data: [] };

    const inventoryData: InventoryAnalysisResult[] = allData.map((item) => {
      const codeStr = String(item.material_code || '');
      const firstChar = codeStr.substring(0, 1);
      
      return {
        materialCode: codeStr,
        materialName: item.material_name || '',
        materialGroup: getGroupName(firstChar),
        plant: item.plant || '',
        storageLocation: item.storage_location || '',
        currentQuantity: Number(item.inventory_quantity || 0),
        unit: item.unit || '',
        unitPrice: Number(item.unit_price || 0),
        totalAmount: Number(item.inventory_amount || 0),
        firstReceiptDate: null,
        lastReceiptDate: null,
        lastReceiptQty: 0,
        lastIssueDate: null,
        lastMonthConsumeQty: 0,
        last6MonthsIssueQty: 0,
        monthlyAvgIssueQty: 0,
        inactiveDays: null,
        coverageMonths: null,
        bomStatus: 'N/A',
      };
    });

    const materialCodes = inventoryData.map(item => item.materialCode);
    const DATASET_NAME = 'harim_sap_bi'; 

    // 💡 팩트 데이터를 한 번의 쿼리로 모두 추출하는 강력한 SQL
    const mb51Query = `
      WITH MovementData AS (
        SELECT 
          MATNR,
          BUDAT,
          SUBSTR(BUDAT, 1, 6) as YYYYMM,
          BWART,
          CASE 
            WHEN BWART IN ('101', '102') THEN 'RECEIPT'
            WHEN SUBSTR(MATNR, 1, 1) IN ('1', '2', '3', '4') AND BWART IN ('261', '262') THEN 'ISSUE'
            WHEN SUBSTR(MATNR, 1, 1) IN ('5', '6') AND BWART IN ('601', '602', '611') THEN 'ISSUE'
            ELSE 'OTHER' 
          END AS mov_type,
          CASE 
            WHEN BWART IN ('101') THEN ABS(ERFMG)
            WHEN BWART IN ('102') THEN -ABS(ERFMG)
            ELSE 0
          END AS receipt_qty,
          CASE 
            WHEN BWART IN ('261', '601', '611') THEN ABS(ERFMG)
            WHEN BWART IN ('262', '602') THEN -ABS(ERFMG) 
            ELSE 0 
          END AS consume_qty
        FROM \`${process.env.GOOGLE_PROJECT_ID}.${DATASET_NAME}.MM_MB51\`
        WHERE MATNR IN UNNEST(@codes)
      ),
      AggregatedDates AS (
        SELECT 
          MATNR,
          MIN(CASE WHEN mov_type = 'RECEIPT' THEN BUDAT END) as first_receipt_date,
          MAX(CASE WHEN mov_type = 'RECEIPT' THEN BUDAT END) as last_receipt_date,
          MAX(CASE WHEN mov_type = 'ISSUE' THEN BUDAT END) as last_issue_date
        FROM MovementData
        GROUP BY MATNR
      ),
      LastReceiptQty AS (
        SELECT m.MATNR, SUM(m.receipt_qty) as last_receipt_qty
        FROM MovementData m
        JOIN AggregatedDates a ON m.MATNR = a.MATNR AND m.BUDAT = a.last_receipt_date
        WHERE m.mov_type = 'RECEIPT'
        GROUP BY m.MATNR
      ),
      LastMonthConsumption AS (
        SELECT m.MATNR, SUM(m.consume_qty) as last_issue_month_qty
        FROM MovementData m
        JOIN AggregatedDates a ON m.MATNR = a.MATNR AND m.YYYYMM = SUBSTR(a.last_issue_date, 1, 6)
        WHERE m.mov_type = 'ISSUE'
        GROUP BY m.MATNR
      ),
      Last6MonthsConsumption AS (
        SELECT m.MATNR, SUM(m.consume_qty) as last_6m_issue_qty
        FROM MovementData m
        WHERE m.mov_type = 'ISSUE' 
          AND m.BUDAT >= '20250901' -- 2026-02-28 기준 6개월 전
          AND m.BUDAT <= '20260228'
        GROUP BY m.MATNR
      )
      
      SELECT 
        a.MATNR,
        a.first_receipt_date,
        a.last_receipt_date,
        a.last_issue_date,
        COALESCE(r.last_receipt_qty, 0) as last_receipt_qty,
        COALESCE(l.last_issue_month_qty, 0) as last_issue_month_qty,
        COALESCE(s.last_6m_issue_qty, 0) as last_6m_issue_qty
      FROM AggregatedDates a
      LEFT JOIN LastReceiptQty r ON a.MATNR = r.MATNR
      LEFT JOIN LastMonthConsumption l ON a.MATNR = l.MATNR
      LEFT JOIN Last6MonthsConsumption s ON a.MATNR = s.MATNR
    `;
    
    const stpoQuery = `
      SELECT DISTINCT IDNRK 
      FROM \`${process.env.GOOGLE_PROJECT_ID}.${DATASET_NAME}.PP_STPO\`
      WHERE IDNRK IN UNNEST(@codes)
    `;

    let mb51Results: any[] = [];
    let stpoResults: any[] = [];

    try {
      const [mb51Response, stpoResponse] = await Promise.all([
        bigquery.query({ query: mb51Query, params: { codes: materialCodes } }),
        bigquery.query({ query: stpoQuery, params: { codes: materialCodes } })
      ]);
      mb51Results = mb51Response[0];
      stpoResults = stpoResponse[0];
    } catch (bqError: any) {
      console.error("🚨 BigQuery 조회 에러:", bqError.message);
    }

    const mb51Map = new Map(mb51Results.map(r => [r.MATNR, r]));
    const bomUsageSet = new Set(stpoResults.map(r => r.IDNRK));

    const parseSAPDate = (sapDateStr: string | undefined | null) => {
      if (!sapDateStr || sapDateStr.length !== 8) return null;
      return `${sapDateStr.substring(0, 4)}-${sapDateStr.substring(4, 6)}-${sapDateStr.substring(6, 8)}`;
    };

    // 💡 2026-02-28 고정 기준일
    const referenceDate = new Date('2026-02-28T00:00:00Z');

    inventoryData.forEach(item => {
      const mb51Data = mb51Map.get(item.materialCode);
      
      // 💡 BOM 상태 판별 (제품/상품은 무조건 N/A 처리)
      if (item.materialGroup === '제품' || item.materialGroup === '상품') {
        item.bomStatus = 'N/A';
      } else {
        item.bomStatus = bomUsageSet.has(item.materialCode) ? 'O' : 'X';
      }

      if (mb51Data) {
        item.firstReceiptDate = parseSAPDate(mb51Data.first_receipt_date);
        item.lastReceiptDate = parseSAPDate(mb51Data.last_receipt_date);
        item.lastReceiptQty = Number(mb51Data.last_receipt_qty || 0);
        
        item.lastIssueDate = parseSAPDate(mb51Data.last_issue_date);
        item.lastMonthConsumeQty = Number(mb51Data.last_issue_month_qty || 0);
        item.last6MonthsIssueQty = Number(mb51Data.last_6m_issue_qty || 0);
        item.monthlyAvgIssueQty = Number((item.last6MonthsIssueQty / 6).toFixed(1));

        // 💡 미활동 일수 (2026-02-28 기준)
        const targetDateStr = item.lastIssueDate || item.lastReceiptDate;
        if (targetDateStr) {
          const targetDate = new Date(`${targetDateStr}T00:00:00Z`);
          const diffTime = referenceDate.getTime() - targetDate.getTime();
          const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          item.inactiveDays = days > 0 ? days : 0; 
        }

        // 💡 재고 회전 월수 (월평균 출고량 기준)
        if (item.monthlyAvgIssueQty > 0) {
           item.coverageMonths = Number((item.currentQuantity / item.monthlyAvgIssueQty).toFixed(1));
        } else {
           item.coverageMonths = 999; // 무한대 (소비 없음)
        }
      }
    });

    return { success: true, data: inventoryData };

  } catch (error: any) {
    console.error('[ERROR] fetchInventoryData:', error.message);
    return { success: false, error: '데이터를 분석하는 중 에러가 발생했습니다.' };
  }
}