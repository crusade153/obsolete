// actions/inventory.ts
'use server';

import { supabase } from '@/lib/supabase';
import { bigquery } from '@/lib/bigquery';
import { InventoryAnalysisResult, MaterialGroup } from '@/types/inventory';

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

export async function fetchInventoryData(plantFilter?: string, groupFilter?: string): Promise<{ success: boolean; data?: InventoryAnalysisResult[]; error?: string }> {
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
        lastActivityDate: null,
        inactiveDays: null,
        hasBomUsage: false,
        status: '분석불가',
      };
    });

    const materialCodes = inventoryData.map(item => item.materialCode);

    // ✅ 선생님께서 말씀해주신 데이터셋 이름으로 영구 적용!
    const DATASET_NAME = 'harim_sap_bi'; 

    const mb51Query = `
      SELECT MATNR, MAX(BUDAT) as last_activity_date 
      FROM \`${process.env.GOOGLE_PROJECT_ID}.${DATASET_NAME}.MM_MB51\`
      WHERE MATNR IN UNNEST(@codes)
      GROUP BY MATNR
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

    const lastActivityMap = new Map(mb51Results.map(r => [r.MATNR, r.last_activity_date?.value || r.last_activity_date]));
    const bomUsageSet = new Set(stpoResults.map(r => r.IDNRK));

    const today = new Date();

    inventoryData.forEach(item => {
      const lastActivity = lastActivityMap.get(item.materialCode);
      if (lastActivity) {
        item.lastActivityDate = String(lastActivity).substring(0, 10);
        
        const activityDate = new Date(item.lastActivityDate);
        const diffTime = Math.abs(today.getTime() - activityDate.getTime());
        item.inactiveDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      }

      item.hasBomUsage = bomUsageSet.has(item.materialCode);

      if (item.inactiveDays !== null) {
        if (item.inactiveDays > 180) {
          item.status = item.hasBomUsage ? '부진' : '불용';
        } else {
          item.status = '정상';
        }
      }
    });

    return { success: true, data: inventoryData };

  } catch (error: any) {
    console.error('[ERROR] fetchInventoryData:', error.message);
    return { success: false, error: '데이터를 분석하는 중 에러가 발생했습니다.' };
  }
}