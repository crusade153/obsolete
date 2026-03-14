// components/SearchBar.tsx
'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition, useState, useEffect } from 'react';

export default function SearchBar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  
  // URL의 search 파라미터를 초기값으로 사용
  const [searchTerm, setSearchTerm] = useState(searchParams.get('search') || '');

  useEffect(() => {
    // 사용자가 타이핑을 멈추고 0.3초(300ms)가 지나면 검색 실행 (디바운스 기법)
    const timer = setTimeout(() => {
      const currentUrlSearch = searchParams.get('search') || '';
      
      // 검색어가 실제로 변경되었을 때만 URL 업데이트
      if (searchTerm !== currentUrlSearch) {
        const params = new URLSearchParams(searchParams.toString());
        
        if (searchTerm) {
          params.set('search', searchTerm);
        } else {
          params.delete('search');
        }
        
        params.set('page', '1'); // 검색어 입력 시 1페이지로 강제 이동
        
        startTransition(() => {
          router.push(`/?${params.toString()}`);
        });
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchTerm, router, searchParams]);

  return (
    <div className="relative w-full md:w-80">
      <input
        type="text"
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        placeholder="자재코드 또는 명칭 즉시 검색..."
        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm transition-all"
      />
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
        🔍
      </span>
      {/* 렌더링 지연 시 보여줄 로딩 텍스트 */}
      {isPending && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-blue-500 animate-pulse">
          검색중...
        </span>
      )}
    </div>
  );
}