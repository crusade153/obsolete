// lib/bigquery.ts
import { BigQuery } from '@google-cloud/bigquery';

/**
 * BigQuery 싱글톤 클라이언트 (Next.js 핫 리로딩 시 중복 연결 방지)
 */
const globalForBigQuery = global as unknown as { bq: BigQuery };

export const bigquery =
  globalForBigQuery.bq ||
  new BigQuery({
    projectId: process.env.GOOGLE_PROJECT_ID,
    credentials: {
      client_email: process.env.GOOGLE_BQ_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_BQ_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
  });

// 개발 환경에서 코드가 수정될 때마다 객체가 재생성되는 것을 막습니다. 
if (process.env.NODE_ENV !== 'production') globalForBigQuery.bq = bigquery;