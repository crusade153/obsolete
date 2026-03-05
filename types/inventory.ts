// types/inventory.ts

/**
 * 1. 자재 이동 이력 (MM_MB51) - BigQuery 원본 테이블 매핑
 */
export interface MovementRecord {
  MATNR: string; // 제품코드 (Material Code) - 8자리 (1~6 시작)
  MAKTX: string; // 제품명 (Material Description)
  BUDAT: string; // 전기일 (Posting Date, ex: '20250101') - 🚨 활동일 추적의 핵심
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
  IDNRK: string;   // 자품목코드 (Child Material Code) - 🚨 BOM 등록(사용처) 유무 확인용
  IDNRK_T: string; // 자품목코드명 (Child Material Name)
}

/**
 * 3. 자재 그룹 분류 (코드 첫 자리 기준 상수화)
 * 하드코딩 방지를 위해 Enum으로 관리합니다.
 */
export enum MaterialGroup {
  RAW = '1',       // 원자재
  SUB = '2',       // 부자재
  PKG = '3',       // 포장재
  SEMI = '4',      // 반제품
  FIN = '5',       // 제품
  TRADE = '6',     // 상품
}

/**
 * 4. 주요 이동유형 (Movement Types)
 * 로직 분기를 위해 명확히 정의합니다.
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
 * 서버에서 연산을 마치고 클라이언트로 내려줄 정제된 데이터 규격입니다.
 */
export interface InventoryAnalysisResult {
  materialCode: string;       // 제품코드
  materialName: string;       // 제품명
  materialGroup: string;      // 자재구분 (원자재, 반제품 등)
  currentQuantity: number;    // 기말재고 수량
  unit: string;               // 단위
  unitPrice: number;          // 단가
  totalAmount: number;        // 금액
  lastActivityDate: string | null; // 최종 활동일 (YYYY-MM-DD)
  inactiveDays: number | null;     // 미활동 일수 (오늘 기준)
  hasBomUsage: boolean;       // BOM 내 존재 여부
  status: '정상' | '부진' | '불용' | '분석불가'; // 최종 상태 판별
}