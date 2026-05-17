// components/SearchBar.tsx
'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, useEffect, useState, useTransition } from 'react';

export default function SearchBar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [searchTerm, setSearchTerm] = useState(searchParams.get('search') || '');

  useEffect(() => {
    setSearchTerm(searchParams.get('search') || '');
  }, [searchParams]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const currentUrlSearch = searchParams.get('search') || '';
    const nextSearch = searchTerm.trim();

    if (nextSearch === currentUrlSearch) return;

    const params = new URLSearchParams(searchParams.toString());

    if (nextSearch) {
      params.set('search', nextSearch);
    } else {
      params.delete('search');
    }

    params.set('page', '1');

    startTransition(() => {
      router.push(`/?${params.toString()}`);
    });
  };

  return (
    <form onSubmit={handleSubmit} className="relative flex w-full md:w-80 gap-2">
      <div className="relative flex-1">
        <input
          type="search"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="자재코드 또는 명칭 검색"
          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm transition-all"
        />
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">⌕</span>
      </div>
      <button
        type="submit"
        className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-bold shadow-sm hover:bg-gray-800 disabled:opacity-60"
        disabled={isPending}
      >
        {isPending ? '검색중' : '검색'}
      </button>
    </form>
  );
}
