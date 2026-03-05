// types/inventory.ts

/**
 * 1. 자재 이동 이력 (MM_MB51) - BigQuery 원본 테이블 매핑
 */
export interface MovementRecord {
  MATNR: string; // 제품코드 (Material Code) - 8자리 (1~6 시작)
  MAKTX: string; // 제품명 (Material Description)
  BUDAT: string; // 전기일 (Posting Date, ex: '20250101')
  ERFMG: number; // 사용수량 (Quantity, 감소는 -, 증가는 +)
  ERFME: string; // 단위 (Unit, ex: 'BOX', 'EA', 'KG')
  BWART: string; // 이동유형 (Movement Type - 101, 261, 601 등)
}

/**
 * 2. BOM 정보 (PP_STPO) - BigQuery 원본 테이블 매핑
 */
export interface BomRecord {
  MATNR: string;   // 모품목코드 (Parent Material Code)
  MATNR_T: string; // 모품목명 (Parent Material Name)
  IDNRK: string;   // 자품목코드 (Child Material Code)
  IDNRK_T: string; // 자품목코드명 (Child Material Name)
}

/**
 * 3. 자재 그룹 분류 (코드 첫 자리 기준 상수화)
 */
export enum MaterialGroup {
  RAW = '1',       // 원자재
  SUB = '2',       // 부자재
  PKG = '3',       // 포장재
  SEMI = '4',      // 반제품
  FIN = '5',       // 제품
  TRADE = '6',     // 상품
}

export type ViewType = 'ALL' | 'PROD' | 'LOGIS'; // 부문 필터용 타입

/**
 * 4. 주요 이동유형 (Movement Types)
 */
export enum MovementType {
  GR_PROD_PURCH = '101', // 생산/구매 입고 (+)
  GR_REVERSAL = '102',   // 생산/구매 입고 취소 (-)
  GI_CONSUMP = '261',    // 생산 투입 (-)
  GI_CONSUMP_REV = '262',// 생산 투입 취소 (+)
  GI_SALES = '601',      // 판매 출고 (-)
  GI_SALES_REV = '602',  // 판매 출고 취소 (+)
  GI_SALES_ALT = '611',  // 판매 출고 (기존 언급된 예외 케이스 대비)
}

/**
 * 5. 프론트엔드/시트에 뿌려질 최종 분석 결과 타입
 */
export interface InventoryAnalysisResult {
  plant: string;              // 플랜트 (ex: '1021')
  storageLocation: string;    // 저장위치 (ex: '2101')
  
  materialCode: string;       // 제품코드
  materialName: string;       // 제품명
  materialGroup: string;      // 자재구분 (원자재, 반제품 등)
  currentQuantity: number;    // 기말재고 수량
  unit: string;               // 단위
  unitPrice: number;          // 단가
  totalAmount: number;        // 금액
  
  // 🚀 팩트 기반 데이터 필드
  firstReceiptDate: string | null;   // 최초 입고일 (창고 체류 기간 파악용)
  lastReceiptDate: string | null;    // 마지막 입고일
  lastReceiptQty: number;            // 마지막 입고 수량
  
  lastIssueDate: string | null;      // 마지막 출고일
  lastMonthConsumeQty: number;       // 마지막 출고 발생 월의 총 소비수량
  last6MonthsIssueQty: number;       // 최근 6개월 누적 출고량
  monthlyAvgIssueQty: number;        // 월평균 출고량 (6개월 누적 / 6)
  
  inactiveDays: number | null;       // 미활동 일수 (2026-02-28 기준)
  coverageMonths: number | null;     // 재고 소진 가능 월수 (현재재고 / 월평균소비량)
  
  bomStatus: 'O' | 'X' | 'N/A';      // BOM 내 존재 여부 (제품/상품은 N/A)
}