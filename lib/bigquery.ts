// lib/bigquery.ts
import { BigQuery } from '@google-cloud/bigquery';

/**
 * BigQuery 싱글톤 클라이언트 (Next.js 핫 리로딩 시 중복 연결 방지)
 */
const globalForBigQuery = global as unknown as { bq: BigQuery };

// 1. 환경변수 이름 매핑: GOOGLE_CLIENT_EMAIL (선생님의 세팅값)을 완벽하게 읽어옵니다.
const clientEmail = process.env.GOOGLE_CLIENT_EMAIL || process.env.GOOGLE_BQ_CLIENT_EMAIL;

// 2. 키 파싱의 악몽 방지: 앞뒤 쌍따옴표 제거 및 \n 문자열을 실제 줄바꿈으로 강력 변환
const rawKey = process.env.GOOGLE_PRIVATE_KEY || process.env.GOOGLE_BQ_PRIVATE_KEY || '';
let cleanKey = rawKey.replace(/^"|"$/g, '');
cleanKey = cleanKey.split('\\n').join('\n');

export const bigquery =
  globalForBigQuery.bq ||
  new BigQuery({
    projectId: process.env.GOOGLE_PROJECT_ID,
    credentials: {
      client_email: clientEmail, // 매핑된 이메일 전달
      private_key: cleanKey,
    },
  });

// 개발 환경에서 코드가 수정될 때마다 객체가 재생성되는 것을 막습니다.
if (process.env.NODE_ENV !== 'production') globalForBigQuery.bq = bigquery;