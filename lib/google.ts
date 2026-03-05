// lib/google.ts
import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';

const getAuth = () => {
  try {
    // 1. 물리적 파일 경로 찾기 (프로젝트 최상위의 credentials.json)
    const keyPath = path.join(process.cwd(), 'credentials.json');
    
    // 2. 파일 내용을 텍스트 그대로 읽어와서 JSON 객체로 완벽하게 파싱
    const fileContents = fs.readFileSync(keyPath, 'utf8');
    const credentials = JSON.parse(fileContents);

    return new google.auth.GoogleAuth({
      credentials: {
        client_email: credentials.client_email,
        private_key: credentials.private_key, // 파싱 변형 0%, 완벽한 원본 키!
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
  } catch (error) {
    console.error("🚨 credentials.json 파일을 읽는 중 에러 발생:", error);
    throw error;
  }
};

export const sheets = google.sheets({ version: 'v4', auth: getAuth() });