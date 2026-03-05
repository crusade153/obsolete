// app/debug/page.tsx
import { fetchInventoryData } from '@/actions/inventory';

/**
 * 🐛 진단용 UI (Server Component)
 * 브라우저가 할 필요 없는 무거운 계산과 데이터 페칭을 서버에서 처리합니다.
 */
export default async function DebugPage() {
  // 1. 서버 액션을 호출하여 구글 시트 데이터를 가져옵니다.
  const result = await fetchInventoryData();

  // 2. 에러 처리 (실패에 대비하라 원칙)
  if (!result.success) {
    return (
      <div className="p-8 font-sans">
        <h1 className="text-2xl font-bold text-red-600 mb-4">🚨 데이터 로딩 실패</h1>
        <p className="bg-red-50 p-4 border border-red-200 rounded text-red-800">
          {result.error}
        </p>
        <p className="mt-4 text-sm text-gray-600">
          * .env.local 파일의 키 설정과 구글 시트 공유(편집자) 권한을 다시 확인해 주세요.
        </p>
      </div>
    );
  }

  const data = result.data || [];

  // 3. 성공 시 화면 렌더링 (UI Optimism & 직관성)
  return (
    <div className="p-8 font-sans max-w-5xl mx-auto">
      <h1 className="text-3xl font-bold mb-2">🐛 수불부 시트 데이터 진단</h1>
      <p className="text-gray-600 mb-6">
        구글 시트에서 성공적으로 데이터를 읽어와 타입 규격에 맞게 변환했습니다.
      </p>

      <div className="flex gap-4 mb-6">
        <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg flex-1">
          <p className="text-sm text-blue-800 font-semibold">총 로드된 행(Row) 개수</p>
          <p className="text-3xl font-bold text-blue-900">{data.length.toLocaleString()} 건</p>
        </div>
      </div>

      <div className="bg-gray-800 text-green-400 p-4 rounded-t-lg text-sm font-mono border-b border-gray-700">
        최상위 5건 샘플 (JSON 규격 확인)
      </div>
      <div className="overflow-auto max-h-[600px] border border-gray-300 rounded-b-lg shadow-inner bg-gray-50">
        <pre className="p-4 text-sm font-mono text-gray-800">
          {JSON.stringify(data.slice(0, 5), null, 2)}
        </pre>
      </div>
    </div>
  );
}