// actions/inventory.ts
'use server';

import { supabase } from '@/lib/supabase';
import { bigquery } from '@/lib/bigquery';
import { InventoryAnalysisResult, MaterialGroup, ViewType } from '@/types/inventory';
import { unstable_cache } from 'next/cache';

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

export const fetchAvailablePlants = unstable_cache(
  async (): Promise<string[]> => {
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
  },
  ['available-plants-cache'],
  { revalidate: 3600, tags: ['inventory'] }
);

const globalCache = global as unknown as {
  __INVENTORY_DATA_CACHE__?: {
    [key: string]: {
      timestamp: number;
      data: { success: boolean; data?: InventoryAnalysisResult[]; error?: string };
    };
  };
};

if (!globalCache.__INVENTORY_DATA_CACHE__) {
  globalCache.__INVENTORY_DATA_CACHE__ = {};
}

export async function fetchInventoryData(
  plantFilter?: string, 
  groupFilter?: string, 
  viewFilter?: string 
): Promise<{ success: boolean; data?: InventoryAnalysisResult[]; error?: string }> {
  
  const cacheKey = `${plantFilter || 'ALL'}_${groupFilter || 'ALL'}_${viewFilter || 'ALL'}`;
  const CACHE_TTL = 3600 * 1000; 
  const now = Date.now();

  const cached = globalCache.__INVENTORY_DATA_CACHE__![cacheKey];
  if (cached && (now - cached.timestamp < CACHE_TTL)) {
    return cached.data;
  }

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

      if (groupFilter && groupFilter !== 'ALL') {
        query = query.like('material_code', `${groupFilter}%`);
      } else if (viewFilter === 'PROD') {
        query = query.or('material_code.like.1%,material_code.like.2%,material_code.like.3%,material_code.like.4%');
      } else if (viewFilter === 'LOGIS') {
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

    if (allData.length === 0) {
      const emptyResult = { success: true, data: [] };
      globalCache.__INVENTORY_DATA_CACHE__![cacheKey] = { timestamp: now, data: emptyResult };
      return emptyResult;
    }

    // 🚀 1. 저장위치/배치 등으로 나뉘어진 "동일 플랜트 + 동일 자재코드" 병합 로직 (핵심 수정)
    const aggregatedMap = new Map<string, any>();

    for (const row of allData) {
      const codeStr = String(row.material_code || '').replace(/^0+/, '').trim();
      const plant = row.plant || 'UNKNOWN';
      const key = `${plant}_${codeStr}`; // 플랜트와 자재코드의 조합을 고유 키로 설정

      if (!aggregatedMap.has(key)) {
        aggregatedMap.set(key, {
          material_code: codeStr,
          material_name: row.material_name || '',
          plant: plant,
          storage_location: row.storage_location || '',
          inventory_quantity: Number(row.inventory_quantity || 0),
          unit: row.unit || '',
          unit_price: Number(row.unit_price || 0),
          inventory_amount: Number(row.inventory_amount || 0),
        });
      } else {
        // 이미 존재하는 키라면 수량과 금액을 누적 합산합니다.
        const existing = aggregatedMap.get(key);
        existing.inventory_quantity += Number(row.inventory_quantity || 0);
        existing.inventory_amount += Number(row.inventory_amount || 0);
        existing.storage_location = '통합'; // 합쳐진 재고임을 명시
      }
    }

    // 병합이 완료된 순수 데이터를 배열로 변환
    const aggregatedRawData = Array.from(aggregatedMap.values());

    const inventoryData: InventoryAnalysisResult[] = aggregatedRawData.map((item) => {
      const firstChar = item.material_code.substring(0, 1);
      
      return {
        materialCode: item.material_code,
        materialName: item.material_name,
        materialGroup: getGroupName(firstChar),
        plant: item.plant,
        storageLocation: item.storage_location,
        currentQuantity: item.inventory_quantity,
        unit: item.unit,
        unitPrice: item.unit_price,
        totalAmount: item.inventory_amount,
        firstReceiptDate: null,
        lastReceiptDate: null,
        lastReceiptQty: 0,
        lastIssueDate: null,
        lastIssueQty: 0,
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

    const mb51Query = `
      WITH RawMovement AS (
        SELECT DISTINCT
          LTRIM(TRIM(CAST(MATNR AS STRING)), '0') AS MATNR, 
          MBLNR, 
          ZEILE, 
          REPLACE(REPLACE(REPLACE(TRIM(CAST(BUDAT AS STRING)), '.', ''), '-', ''), '/', '') AS BUDAT, 
          TRIM(CAST(BWART AS STRING)) AS BWART, 
          CAST(REPLACE(REPLACE(COALESCE(CAST(ERFMG AS STRING), '0'), '-', ''), ',', '') AS FLOAT64) AS abs_erfmg
        FROM \`${process.env.GOOGLE_PROJECT_ID}.${DATASET_NAME}.MM_MB51\`
        WHERE LTRIM(TRIM(CAST(MATNR AS STRING)), '0') IN UNNEST(@codes)
      ),
      MovementData AS (
        SELECT 
          MATNR, BUDAT, SUBSTR(BUDAT, 1, 6) as YYYYMM, BWART,
          CASE 
            WHEN BWART IN ('101', '102') THEN 'RECEIPT'
            WHEN SUBSTR(MATNR, 1, 1) IN ('1', '2', '3', '4') AND BWART IN ('261', '262') THEN 'ISSUE'
            WHEN SUBSTR(MATNR, 1, 1) IN ('5', '6') AND BWART IN ('601', '602', '261', '262') THEN 'ISSUE'
            ELSE 'OTHER' 
          END AS mov_type,
          
          CASE 
            WHEN BWART = '101' THEN abs_erfmg
            WHEN BWART = '102' THEN -abs_erfmg
            ELSE 0
          END AS receipt_qty,
          
          CASE 
            WHEN SUBSTR(MATNR, 1, 1) IN ('1', '2', '3', '4') AND BWART = '261' THEN abs_erfmg
            WHEN SUBSTR(MATNR, 1, 1) IN ('1', '2', '3', '4') AND BWART = '262' THEN -abs_erfmg
            WHEN SUBSTR(MATNR, 1, 1) IN ('5', '6') AND BWART IN ('601', '261') THEN abs_erfmg
            WHEN SUBSTR(MATNR, 1, 1) IN ('5', '6') AND BWART IN ('602', '262') THEN -abs_erfmg
            ELSE 0 
          END AS consume_qty
        FROM RawMovement
      ),
      
      DailyReceipt AS (
        SELECT MATNR, BUDAT, SUM(receipt_qty) as daily_qty
        FROM MovementData
        WHERE mov_type = 'RECEIPT'
        GROUP BY MATNR, BUDAT
        HAVING SUM(receipt_qty) > 0 
      ),
      RankedReceipt AS (
        SELECT MATNR, BUDAT, daily_qty,
               ROW_NUMBER() OVER(PARTITION BY MATNR ORDER BY BUDAT ASC) as rn_first,
               ROW_NUMBER() OVER(PARTITION BY MATNR ORDER BY BUDAT DESC) as rn_last
        FROM DailyReceipt
      ),
      FirstReceipt AS (
        SELECT MATNR, BUDAT as first_receipt_date
        FROM RankedReceipt WHERE rn_first = 1
      ),
      LastReceipt AS (
        SELECT MATNR, BUDAT as last_receipt_date, daily_qty as last_receipt_qty
        FROM RankedReceipt WHERE rn_last = 1
      ),
      
      DailyIssue AS (
        SELECT MATNR, BUDAT, SUM(consume_qty) as daily_qty
        FROM MovementData
        WHERE mov_type = 'ISSUE'
        GROUP BY MATNR, BUDAT
        HAVING SUM(consume_qty) > 0
      ),
      RankedIssue AS (
        SELECT MATNR, BUDAT, daily_qty,
               ROW_NUMBER() OVER(PARTITION BY MATNR ORDER BY BUDAT DESC) as rn_last
        FROM DailyIssue
      ),
      LastIssue AS (
        SELECT MATNR, BUDAT as last_issue_date, daily_qty as last_issue_qty
        FROM RankedIssue WHERE rn_last = 1
      ),
      
      RecentConsumption AS (
        SELECT 
          MATNR,
          SUM(CASE WHEN YYYYMM = '202602' THEN consume_qty ELSE 0 END) as current_month_issue_qty,
          SUM(CASE WHEN BUDAT >= '20250901' AND BUDAT <= '20260228' THEN consume_qty ELSE 0 END) as last_6m_issue_qty
        FROM MovementData
        WHERE mov_type = 'ISSUE'
        GROUP BY MATNR
      ),
      
      BaseGroup AS (
        SELECT DISTINCT MATNR FROM MovementData
      )
      
      SELECT 
        b.MATNR,
        fr.first_receipt_date,
        lr.last_receipt_date,
        COALESCE(lr.last_receipt_qty, 0) as last_receipt_qty,
        li.last_issue_date,
        COALESCE(li.last_issue_qty, 0) as last_issue_qty,
        COALESCE(rc.current_month_issue_qty, 0) as current_month_issue_qty,
        COALESCE(rc.last_6m_issue_qty, 0) as last_6m_issue_qty
      FROM BaseGroup b
      LEFT JOIN FirstReceipt fr ON b.MATNR = fr.MATNR
      LEFT JOIN LastReceipt lr ON b.MATNR = lr.MATNR
      LEFT JOIN LastIssue li ON b.MATNR = li.MATNR
      LEFT JOIN RecentConsumption rc ON b.MATNR = rc.MATNR
    `;
    
    const stpoQuery = `
      SELECT DISTINCT LTRIM(TRIM(CAST(IDNRK AS STRING)), '0') AS IDNRK
      FROM \`${process.env.GOOGLE_PROJECT_ID}.${DATASET_NAME}.PP_STPO\`
      WHERE LTRIM(TRIM(CAST(IDNRK AS STRING)), '0') IN UNNEST(@codes)
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
      const str = String(sapDateStr || '');
      if (str.length !== 8) return null;
      return `${str.substring(0, 4)}-${str.substring(4, 6)}-${str.substring(6, 8)}`;
    };

    const referenceDate = new Date('2026-02-28T00:00:00Z');

    inventoryData.forEach(item => {
      const mCode = item.materialCode;
      const mb51Data = mb51Map.get(mCode);
      
      if (item.materialGroup === '제품' || item.materialGroup === '상품') {
        item.bomStatus = 'N/A';
      } else {
        item.bomStatus = bomUsageSet.has(mCode) ? 'O' : 'X';
      }

      if (mb51Data) {
        item.firstReceiptDate = parseSAPDate(mb51Data.first_receipt_date);
        item.lastReceiptDate = parseSAPDate(mb51Data.last_receipt_date);
        item.lastReceiptQty = Number(mb51Data.last_receipt_qty || 0);
        
        item.lastIssueDate = parseSAPDate(mb51Data.last_issue_date);
        item.lastIssueQty = Number(mb51Data.last_issue_qty || 0); 
        
        item.lastMonthConsumeQty = Number(mb51Data.current_month_issue_qty || 0);
        item.last6MonthsIssueQty = Number(mb51Data.last_6m_issue_qty || 0);
        item.monthlyAvgIssueQty = Number((item.last6MonthsIssueQty / 6).toFixed(1));

        const targetDateStr = item.lastIssueDate || item.lastReceiptDate;
        if (targetDateStr) {
          const targetDate = new Date(`${targetDateStr}T00:00:00Z`);
          const diffTime = referenceDate.getTime() - targetDate.getTime();
          const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          item.inactiveDays = days > 0 ? days : 0; 
        }

        // 🚀 이제 currentQuantity가 완벽히 합산되어 있으므로 커버리지 팩터가 정상적으로 계산됩니다.
        if (item.monthlyAvgIssueQty > 0) {
           item.coverageMonths = Number((item.currentQuantity / item.monthlyAvgIssueQty).toFixed(1));
        } else {
           item.coverageMonths = 999; 
        }
      }
    });

    const resultPayload = { success: true, data: inventoryData };
    
    globalCache.__INVENTORY_DATA_CACHE__![cacheKey] = {
      timestamp: now,
      data: resultPayload
    };

    return resultPayload;

  } catch (error: any) {
    console.error('[ERROR] fetchInventoryData:', error.message);
    return { success: false, error: '데이터를 분석하는 중 에러가 발생했습니다.' };
  }
}