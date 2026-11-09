import { createClient, SupabaseClient } from '@supabase/supabase-js';

export const STORAGE_KEY_SUPABASE_CONFIG = 'daeseong_steel_supabase_config_v1';

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  updatedAt?: string;
}

const envSupabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() || '';
const envSupabaseAnonKey =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() || '';

export function getSavedSupabaseConfig(): SupabaseConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SUPABASE_CONFIG);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SupabaseConfig>;
      if (parsed.url && parsed.anonKey) {
        return {
          url: parsed.url.trim(),
          anonKey: parsed.anonKey.trim(),
          updatedAt: parsed.updatedAt,
        };
      }
    }
  } catch (e) {
    console.error('Failed to read Supabase config from localStorage', e);
  }
  return {
    url: envSupabaseUrl,
    anonKey: envSupabaseAnonKey,
  };
}

let supabaseInstance: SupabaseClient | null = null;
let currentConfiguredUrl = '';
let currentConfiguredKey = '';

/**
 * 환경변수(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY) 또는
 * 최고관리자 DB 설정 모달(localStorage)에서 구성된 값으로 싱글톤 클라이언트를 반환합니다.
 */
export function getSupabaseClient(): SupabaseClient | null {
  const { url, anonKey } = getSavedSupabaseConfig();
  if (!url || !anonKey) {
    supabaseInstance = null;
    currentConfiguredUrl = '';
    currentConfiguredKey = '';
    return null;
  }

  if (
    !supabaseInstance ||
    currentConfiguredUrl !== url ||
    currentConfiguredKey !== anonKey
  ) {
    try {
      supabaseInstance = createClient(url, anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
        },
      });
      currentConfiguredUrl = url;
      currentConfiguredKey = anonKey;
    } catch (e) {
      console.error('Failed to initialize Supabase client', e);
      return null;
    }
  }

  return supabaseInstance;
}

export const supabase: SupabaseClient | null = getSupabaseClient();

/**
 * 입력받은 Supabase Project URL 및 Anon Key로 실제 연결 가능 여부를 테스트합니다.
 */
export async function testSupabaseConnection(
  url: string,
  anonKey: string
): Promise<{ ok: boolean; message: string }> {
  const trimmedUrl = url.trim().replace(/\/+$/, '');
  const trimmedKey = anonKey.trim();

  if (!trimmedUrl.startsWith('https://') && !trimmedUrl.startsWith('http://')) {
    return {
      ok: false,
      message: '유효한 Supabase Project URL 형식(https://...)을 입력해주세요.',
    };
  }

  if (trimmedKey.length < 20) {
    return {
      ok: false,
      message: '유효한 Supabase Anon API Key를 입력해주세요.',
    };
  }

  try {
    const tempClient = createClient(trimmedUrl, trimmedKey, {
      auth: { persistSession: false },
    });

    // Supabase Auth 세션 엔드포인트 또는 REST 루트 응답 확인
    const { error } = await tempClient.auth.getSession();
    if (error) {
      return {
        ok: false,
        message: `Supabase 인증 오류: ${error.message}`,
      };
    }

    return {
      ok: true,
      message: 'Supabase 클라우드 데이터베이스 연결 테스트에 성공했습니다.',
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : '네트워크 또는 URL 오류';
    return {
      ok: false,
      message: `연결 테스트 실패: ${msg}`,
    };
  }
}
