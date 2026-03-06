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
  viewFilter?: string 
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

    if (allData.length === 0) return { success: true, data: [] };

    const inventoryData: InventoryAnalysisResult[] = allData.map((item) => {
      const codeStr = String(item.material_code || '').replace(/^0+/, '').trim();
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
        lastIssueQty: 0,
        lastMonthConsumeQty: 0,
        last6MonthsIssueQty: 0,
        monthlyAvgIssueQty: 0,
        inactiveDays: null,
        coverageMonths: null,
        bomStatus: 'N/A',
      };
    });

    const materialCodes = inventoryData.map(item => String(item.materialCode).replace(/^0+/, '').trim());
    const DATASET_NAME = 'harim_sap_bi'; 

    // 🚀 원천 문제 해결: LGORT(창고)를 제거하고 플랜트(WERKS) 단위로 모든 재고 활동 병합
    const mb51Query = `
      WITH RawMovement AS (
        SELECT DISTINCT
          LTRIM(TRIM(CAST(MATNR AS STRING)), '0') AS MATNR, 
          TRIM(CAST(WERKS AS STRING)) AS WERKS, 
          -- 💡 더 이상 LGORT에 얽매여 과거 기록을 놓치지 않도록 LGORT 제외
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
          MATNR, WERKS, BUDAT, SUBSTR(BUDAT, 1, 6) as YYYYMM, BWART,
          -- 💡 사용자가 명시한 가장 정확하고 엄격한 이동유형 룰 유지
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
      
      -- 1️⃣ 입고 (RECEIPT)
      DailyReceipt AS (
        SELECT MATNR, WERKS, BUDAT, SUM(receipt_qty) as daily_qty
        FROM MovementData
        WHERE mov_type = 'RECEIPT'
        GROUP BY MATNR, WERKS, BUDAT
        HAVING SUM(receipt_qty) > 0 
      ),
      RankedReceipt AS (
        SELECT MATNR, WERKS, BUDAT, daily_qty,
               ROW_NUMBER() OVER(PARTITION BY MATNR, WERKS ORDER BY BUDAT ASC) as rn_first,
               ROW_NUMBER() OVER(PARTITION BY MATNR, WERKS ORDER BY BUDAT DESC) as rn_last
        FROM DailyReceipt
      ),
      FirstReceipt AS (
        SELECT MATNR, WERKS, BUDAT as first_receipt_date
        FROM RankedReceipt WHERE rn_first = 1
      ),
      LastReceipt AS (
        SELECT MATNR, WERKS, BUDAT as last_receipt_date, daily_qty as last_receipt_qty
        FROM RankedReceipt WHERE rn_last = 1
      ),
      
      -- 2️⃣ 출고 (ISSUE)
      DailyIssue AS (
        SELECT MATNR, WERKS, BUDAT, SUM(consume_qty) as daily_qty
        FROM MovementData
        WHERE mov_type = 'ISSUE'
        GROUP BY MATNR, WERKS, BUDAT
        HAVING SUM(consume_qty) > 0
      ),
      RankedIssue AS (
        SELECT MATNR, WERKS, BUDAT, daily_qty,
               ROW_NUMBER() OVER(PARTITION BY MATNR, WERKS ORDER BY BUDAT DESC) as rn_last
        FROM DailyIssue
      ),
      LastIssue AS (
        SELECT MATNR, WERKS, BUDAT as last_issue_date, daily_qty as last_issue_qty
        FROM RankedIssue WHERE rn_last = 1
      ),
      
      -- 3️⃣ 회전율 계산을 위한 기간별 소비량 추출 (당월 & 최근 6개월 명확히 분리)
      RecentConsumption AS (
        SELECT 
          MATNR, WERKS,
          -- 💡 2026년 2월을 당월(Current Month)로 픽스하여 출고량 합산
          SUM(CASE WHEN YYYYMM = '202602' THEN consume_qty ELSE 0 END) as current_month_issue_qty,
          -- 💡 최근 6개월 (2025.09.01 ~ 2026.02.28) 누적 출고량
          SUM(CASE WHEN BUDAT >= '20250901' AND BUDAT <= '20260228' THEN consume_qty ELSE 0 END) as last_6m_issue_qty
        FROM MovementData
        WHERE mov_type = 'ISSUE'
        GROUP BY MATNR, WERKS
      ),
      
      BaseGroup AS (
        SELECT DISTINCT MATNR, WERKS FROM MovementData
      )
      
      SELECT 
        b.MATNR, b.WERKS,
        fr.first_receipt_date,
        lr.last_receipt_date,
        COALESCE(lr.last_receipt_qty, 0) as last_receipt_qty,
        li.last_issue_date,
        COALESCE(li.last_issue_qty, 0) as last_issue_qty,
        COALESCE(rc.current_month_issue_qty, 0) as current_month_issue_qty,
        COALESCE(rc.last_6m_issue_qty, 0) as last_6m_issue_qty
      FROM BaseGroup b
      LEFT JOIN FirstReceipt fr ON b.MATNR = fr.MATNR AND b.WERKS = fr.WERKS
      LEFT JOIN LastReceipt lr ON b.MATNR = lr.MATNR AND b.WERKS = lr.WERKS
      LEFT JOIN LastIssue li ON b.MATNR = li.MATNR AND b.WERKS = li.WERKS
      LEFT JOIN RecentConsumption rc ON b.MATNR = rc.MATNR AND b.WERKS = rc.WERKS
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

    // 💡 키 매핑에서도 저장위치(LGORT)를 배제하고 플랜트 단위로 연결
    const mb51Map = new Map(mb51Results.map(r => [`${r.MATNR}_${r.WERKS}`, r]));
    const bomUsageSet = new Set(stpoResults.map(r => r.IDNRK));

    const parseSAPDate = (sapDateStr: string | undefined | null) => {
      const str = String(sapDateStr || '');
      if (str.length !== 8) return null;
      return `${str.substring(0, 4)}-${str.substring(4, 6)}-${str.substring(6, 8)}`;
    };

    const referenceDate = new Date('2026-02-28T00:00:00Z');

    inventoryData.forEach(item => {
      const mCode = String(item.materialCode).replace(/^0+/, '').trim();
      const plant = String(item.plant).trim();
      
      const uniqueKey = `${mCode}_${plant}`;
      const mb51Data = mb51Map.get(uniqueKey);
      
      if (item.materialGroup === '제품' || item.materialGroup === '상품') {
        item.bomStatus = 'N/A';
      } else {
        item.bomStatus = bomUsageSet.has(mCode) ? 'O' : 'X';
      }

      if (mb51Data) {
        item.firstReceiptDate = parseSAPDate(mb51Data.first_receipt_date);
        item.lastReceiptDate = parseSAPDate(mb51Data.last_receipt_date);
        item.lastReceiptQty = Number(mb51Data.last_receipt_qty || 0);
        
        // 🔥 이제 24년이 아닌 가장 마지막 출고일(예: 26.2.24)이 무조건 매핑됩니다.
        item.lastIssueDate = parseSAPDate(mb51Data.last_issue_date);
        item.lastIssueQty = Number(mb51Data.last_issue_qty || 0); 
        
        // 당월(26년 2월) 및 누적 출고량
        item.lastMonthConsumeQty = Number(mb51Data.current_month_issue_qty || 0);
        item.last6MonthsIssueQty = Number(mb51Data.last_6m_issue_qty || 0);
        item.monthlyAvgIssueQty = Number((item.last6MonthsIssueQty / 6).toFixed(1));

        // 🚀 당월 및 최근 6개월 회전율 계산 로직 추가 (출고수량 / 기말수량 * 100)
        // 화면/엑셀에서 활용할 수 있도록 객체에 주입합니다.
        (item as any).turnoverRate1M = item.currentQuantity > 0 
          ? Number(((item.lastMonthConsumeQty / item.currentQuantity) * 100).toFixed(1)) 
          : (item.lastMonthConsumeQty > 0 ? 999 : 0);
          
        (item as any).turnoverRate6M = item.currentQuantity > 0 
          ? Number(((item.last6MonthsIssueQty / item.currentQuantity) * 100).toFixed(1)) 
          : (item.last6MonthsIssueQty > 0 ? 999 : 0);

        const targetDateStr = item.lastIssueDate || item.lastReceiptDate;
        if (targetDateStr) {
          const targetDate = new Date(`${targetDateStr}T00:00:00Z`);
          const diffTime = referenceDate.getTime() - targetDate.getTime();
          const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          item.inactiveDays = days > 0 ? days : 0; 
        }

        if (item.monthlyAvgIssueQty > 0) {
           item.coverageMonths = Number((item.currentQuantity / item.monthlyAvgIssueQty).toFixed(1));
        } else {
           item.coverageMonths = 999; 
        }
      }
    });

    return { success: true, data: inventoryData };

  } catch (error: any) {
    console.error('[ERROR] fetchInventoryData:', error.message);
    return { success: false, error: '데이터를 분석하는 중 에러가 발생했습니다.' };
  }
}