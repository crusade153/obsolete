// components/ExcelDownloadButton.tsx
'use client';

type DownloadMode = 'inventory' | 'plan';

interface Props {
  mode?: DownloadMode;
  queryString?: string;
}

export default function ExcelDownloadButton({ mode = 'inventory', queryString = '' }: Props) {
  const handleDownload = () => {
    const params = new URLSearchParams(queryString);
    params.set('mode', mode);

    window.location.href = `/download?${params.toString()}`;
  };

  return (
    <button
      onClick={handleDownload}
      className="bg-green-600 hover:bg-green-700 text-white px-5 py-2.5 rounded-lg text-sm font-bold shadow-md transition-all flex items-center gap-2 active:scale-95"
      type="button"
    >
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
      </svg>
      CSV 다운로드
    </button>
  );
}
