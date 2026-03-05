'use server';

import { supabase } from '@/lib/supabase';
import { InventoryAnalysisResult } from '@/types/inventory';

/**
 * [Server Action] Supabase에서 기말재고 데이터를 한 번에 가져옵니다.
 */
export async function fetchInventoryData(): Promise<{ success: boolean; data?: InventoryAnalysisResult[]; error?: string }> {
  try {
    // 1. Supabase 테이블에서 모든 데이터 조회 (지침서 "배치로 처리하라" 준수) [cite: 42]
    const { data, error } = await supabase
      .from('ending_inventory')
      .select('*');

    if (error) throw error;

    if (!data || data.length === 0) {
      return { success: false, error: 'Supabase 테이블에 데이터가 없습니다.' };
    }

    // 2. DB 데이터를 인터페이스 규격에 맞게 변환 (엄격한 타입 적용) [cite: 9]
    const inventoryData: InventoryAnalysisResult[] = data.map((item) => ({
      materialGroup: item.material_group || '', // DB 컬럼명 확인 필요 (원자재/제품 등)
      materialCode: item.material_code,
      materialName: item.material_name,
      plant: item.plant,
      storageLocation: item.storage_location,
      unit: item.unit,
      currentQuantity: Number(item.inventory_quantity),
      unitPrice: Number(item.unit_price),
      totalAmount: Number(item.inventory_amount),
      
      // 추후 BigQuery 데이터와 결합될 필드들
      lastActivityDate: null,
      inactiveDays: null,
      hasBomUsage: false,
      status: '분석불가',
    }));

    return { success: true, data: inventoryData };

  } catch (error: any) {
    console.error('[ERROR] fetchInventoryData:', error.message);
    return { success: false, error: 'Supabase 데이터를 읽어오는 중 에러가 발생했습니다.' };
  }
}