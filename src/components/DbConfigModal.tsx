import React, { useState, useEffect } from 'react';
import {
  Database,
  X,
  CheckCircle2,
  AlertCircle,
  KeyRound,
  Globe,
  Loader2,
  Trash2,
  ShieldCheck,
} from 'lucide-react';
import {
  getSavedSupabaseConfig,
  purgeLegacyLocalStorageData,
  setRuntimeSupabaseConfig,
  SupabaseConfig,
  testSupabaseConnection,
} from '../lib/supabase';

interface DbConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigSaved: (isConnected: boolean) => void;
  onShowToast?: (msg: string) => void;
}

export const DbConfigModal: React.FC<DbConfigModalProps> = ({
  isOpen,
  onClose,
  onConfigSaved,
  onShowToast,
}) => {
  const [url, setUrl] = useState('');
  const [anonKey, setAnonKey] = useState('');
  const [updatedAt, setUpdatedAt] = useState<string | undefined>(undefined);
  const [isTesting, setIsTesting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  useEffect(() => {
    if (isOpen) {
      const cfg = getSavedSupabaseConfig();
      setUrl(cfg.url || '');
      setAnonKey(cfg.anonKey || '');
      setUpdatedAt(cfg.updatedAt);
      setStatusMessage(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isCurrentlyConfigured = Boolean(url.trim() && anonKey.trim());

  const handleTestAndSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);
    setIsTesting(true);

    const result = await testSupabaseConnection(url, anonKey);
    setIsTesting(false);

    if (!result.ok) {
      setStatusMessage({ type: 'error', text: result.message });
      return;
    }

    const nowStr = new Date().toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });

    const newConfig: SupabaseConfig = {
      url: url.trim().replace(/\/+$/, ''),
      anonKey: anonKey.trim(),
      updatedAt: nowStr,
    };

    try {
      purgeLegacyLocalStorageData();
      setRuntimeSupabaseConfig(newConfig);
      setUpdatedAt(nowStr);
      setStatusMessage({
        type: 'success',
        text: `${result.message} 클라우드 DB 단일 연동 모드가 활성화되었습니다.`,
      });
      onConfigSaved(true);
      if (onShowToast) {
        onShowToast('Supabase 클라우드 DB 환경설정이 연결되었으며 실시간 데이터를 불러옵니다.');
      }
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: 'DB 연결 설정을 적용하는 중 오류가 발생했습니다.',
      });
    }
  };

  const handleClearConfig = () => {
    try {
      purgeLegacyLocalStorageData();
      setRuntimeSupabaseConfig(null);
      setUrl('');
      setAnonKey('');
      setUpdatedAt(undefined);
      setStatusMessage({
        type: 'info',
        text: '저장된 Supabase 연결 정보 및 브라우저 잔여 캐시가 모두 초기화되었습니다.',
      });
      onConfigSaved(false);
      if (onShowToast) {
        onShowToast('Supabase DB 연결 설정 및 로컬 캐시가 초기화되었습니다.');
      }
    } catch (e) {
      console.error('Failed to clear Supabase config', e);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
        {/* Top Header */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-600/20 border border-emerald-500/40 flex items-center justify-center">
              <Database className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-black tracking-tight text-white">
                  Supabase 클라우드 DB 단일 연동 설정
                </h3>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-black bg-indigo-600 text-white border border-indigo-400">
                  LV.0 전용
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                로컬 스토리지 캐시 없이 오직 Supabase 클라우드 DB와 실시간 직접 통신합니다
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleTestAndSave} className="p-6 space-y-4 text-xs">
          {/* Connection Status Banner */}
          <div
            className={`p-3 rounded-xl border flex items-center justify-between gap-2 ${
              isCurrentlyConfigured
                ? 'bg-emerald-50/80 border-emerald-200 text-emerald-900'
                : 'bg-amber-50 border-amber-200 text-amber-900'
            }`}
          >
            <div className="flex items-center gap-2">
              <span
                className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                  isCurrentlyConfigured ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
              />
              <div>
                <div className="font-bold">
                  현재 상태:{' '}
                  {isCurrentlyConfigured
                    ? 'Supabase 클라우드 DB 다이렉트 연동 중'
                    : 'Supabase 클라우드 DB 연결 설정 필요'}
                </div>
                {updatedAt && (
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    최근 연결 일시: {updatedAt}
                  </div>
                )}
              </div>
            </div>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black bg-white border border-slate-200 text-slate-600">
              <ShieldCheck className="w-3 h-3 text-indigo-600" />
              최고관리자 보안
            </span>
          </div>

          {statusMessage && (
            <div
              className={`p-3 rounded-xl border font-bold flex items-start gap-2 ${
                statusMessage.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : statusMessage.type === 'error'
                  ? 'bg-rose-50 border-rose-200 text-rose-700'
                  : 'bg-blue-50 border-blue-200 text-blue-800'
              }`}
            >
              {statusMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              )}
              <span className="leading-relaxed">{statusMessage.text}</span>
            </div>
          )}

          {/* Supabase Project URL */}
          <div>
            <label className="block font-bold text-slate-700 mb-1.5">
              Supabase Project URL
            </label>
            <div className="relative">
              <Globe className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://your-project-id.supabase.co"
                required
                className="w-full border border-slate-300 rounded-xl pl-9 pr-3 py-2.5 font-mono text-xs bg-white text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Supabase Anon API Key */}
          <div>
            <label className="block font-bold text-slate-700 mb-1.5">
              Supabase Anon Public API Key
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="password"
                value={anonKey}
                onChange={(e) => setAnonKey(e.target.value)}
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                required
                className="w-full border border-slate-300 rounded-xl pl-9 pr-3 py-2.5 font-mono text-xs bg-white text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
            <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
              * 환경변수(<code>VITE_SUPABASE_URL</code>, <code>VITE_SUPABASE_ANON_KEY</code>)가 설정된 경우 자동으로 불러오며, 이곳에서 입력 시 브라우저 보안 저장소에 우선 반영됩니다.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={handleClearConfig}
              className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600 font-bold transition-colors cursor-pointer"
              title="저장된 DB 연결 설정 초기화"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>연결 초기화</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition-colors cursor-pointer"
              >
                닫기
              </button>
              <button
                type="submit"
                disabled={isTesting}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-black shadow-md transition-all cursor-pointer"
              >
                {isTesting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>연결 테스트 중...</span>
                  </>
                ) : (
                  <>
                    <Database className="w-3.5 h-3.5" />
                    <span>연결 테스트 및 저장</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
