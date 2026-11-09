import React, { useState, useEffect } from 'react';
import { UserAccount } from '../types';
import { Lock, KeyRound, User, CheckCircle2, AlertCircle, X, ShieldCheck, LogOut } from 'lucide-react';

interface PasswordChangeModalProps {
  isOpen: boolean;
  onClose: () => void;
  userPasswords: Record<string, string>;
  onChangePassword: (username: string, newPassword: string) => void;
  registeredUsers?: UserAccount[];
  isForced?: boolean;
  forcedUsername?: string;
  onLogoutInstead?: () => void;
}

const DEFAULT_VALID_USERNAMES = ['admin', 'field1', 'office1'];

export const PasswordChangeModal: React.FC<PasswordChangeModalProps> = ({
  isOpen,
  onClose,
  userPasswords,
  onChangePassword,
  registeredUsers = [],
  isForced = false,
  forcedUsername,
  onLogoutInstead,
}) => {
  const [targetUsername, setTargetUsername] = useState(forcedUsername || 'admin');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    if (isOpen) {
      if (forcedUsername) {
        setTargetUsername(forcedUsername);
        setCurrentPassword('1234');
      }
      setNewPassword('');
      setConfirmPassword('');
      setErrorMsg('');
      setSuccessMsg('');
    }
  }, [isOpen, forcedUsername]);

  if (!isOpen) return null;

  // 사내 보안 정책 유효성 검사 지표
  const isMinLength = newPassword.length >= 8;
  const hasLetter = /[a-zA-Z]/.test(newPassword);
  const hasNumber = /[0-9]/.test(newPassword);
  const hasSpecial = /[!@#$%^&*(),.?":{}|<>_\-+=/\\[\]~`]/.test(newPassword);
  const isNotDefault1234 = newPassword.length > 0 && newPassword !== '1234';
  const isMatch = newPassword.length > 0 && newPassword === confirmPassword;

  const resetAndClose = () => {
    if (isForced) return;
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setErrorMsg('');
    setSuccessMsg('');
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const trimmedId = (isForced && forcedUsername ? forcedUsername : targetUsername).trim();
    const validIds = new Set([
      ...DEFAULT_VALID_USERNAMES,
      ...registeredUsers.map((u) => u.username),
    ]);

    if (!validIds.has(trimmedId)) {
      setErrorMsg('등록되지 않은 사내 또는 현장 계정 아이디입니다.');
      return;
    }

    const storedPassword = userPasswords[trimmedId];
    const isCurrentValid = storedPassword
      ? currentPassword === storedPassword
      : currentPassword === '1234' || (trimmedId === 'admin' && currentPassword === 'admin123!');

    if (!isCurrentValid) {
      setErrorMsg('현재 비밀번호가 일치하지 않습니다. (초기/초기화된 계정인 경우 1234 입력)');
      return;
    }

    if (newPassword === '1234') {
      setErrorMsg("초기 비밀번호('1234')는 새 비밀번호로 사용할 수 없습니다.");
      return;
    }

    if (!isMinLength) {
      setErrorMsg('보안 정책에 따라 신규 비밀번호는 8자 이상이어야 합니다.');
      return;
    }

    if (!(hasLetter && hasNumber)) {
      setErrorMsg('신규 비밀번호는 영문과 숫자를 반드시 포함해야 합니다. (특수문자 조합 권장)');
      return;
    }

    if (newPassword === currentPassword) {
      setErrorMsg('현재 비밀번호와 동일한 비밀번호로 변경할 수 없습니다.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg('신규 비밀번호와 비밀번호 확인 입력값이 일치하지 않습니다.');
      return;
    }

    onChangePassword(trimmedId, newPassword);
    setSuccessMsg(`'${trimmedId}' 계정의 새 비밀번호가 안전하게 설정되었습니다.`);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');

    setTimeout(() => {
      setErrorMsg('');
      setSuccessMsg('');
      onClose();
    }, 900);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div
          className={`${
            isForced ? 'bg-amber-950 border-amber-800' : 'bg-slate-900 border-slate-800'
          } text-white px-6 py-4 flex items-center justify-between border-b`}
        >
          <div className="flex items-center gap-2.5">
            <div
              className={`w-8 h-8 rounded-lg ${
                isForced ? 'bg-amber-500 text-slate-950' : 'bg-blue-600 text-white'
              } flex items-center justify-center`}
            >
              <KeyRound className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-black tracking-tight text-white">
                  {isForced ? '초기 비밀번호 변경 필수 안내' : '사내 계정 비밀번호 변경'}
                </h3>
                {isForced && (
                  <span className="px-1.5 py-0.5 text-[10px] font-black bg-amber-400 text-slate-950 rounded">
                    보안 강제
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-300">
                {isForced
                  ? "초기 비밀번호('1234') 사용 계정은 즉시 새 비밀번호로 변경해야 합니다."
                  : '대성스틸 MRO 표준 보안 정책 적용'}
              </p>
            </div>
          </div>
          {!isForced && (
            <button
              type="button"
              onClick={resetAndClose}
              className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-3.5 text-xs">
          {isForced && (
            <div className="p-3 bg-amber-50 border border-amber-300 text-amber-950 rounded-xl space-y-1">
              <div className="font-extrabold flex items-center gap-1.5 text-amber-900">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>신규 생성 또는 초기화된 계정 (비밀번호: 1234)</span>
              </div>
              <p className="text-[11px] text-amber-800 leading-relaxed">
                현재 <strong>'{forcedUsername}'</strong> 계정의 비밀번호가 초기값(<strong>1234</strong>) 상태입니다.
                본인의 새 비밀번호로 변경을 완료해야 시스템을 사용하실 수 있습니다.
              </p>
            </div>
          )}

          {errorMsg && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          <div>
            <label className="block font-bold text-slate-700 mb-1">대상 아이디 (ID)</label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={isForced && forcedUsername ? forcedUsername : targetUsername}
                onChange={(e) => {
                  if (!isForced) setTargetUsername(e.target.value);
                }}
                readOnly={isForced}
                placeholder="예: admin, field_sl1, field1"
                required
                className={`w-full border rounded-lg pl-9 pr-3 py-2 font-mono font-bold ${
                  isForced
                    ? 'border-slate-200 bg-slate-100 text-slate-700 cursor-not-allowed'
                    : 'border-slate-300 bg-white text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none'
                }`}
              />
            </div>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">현재 비밀번호</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="현재 비밀번호 입력 (초기값: 1234)"
                required
                className="w-full border border-slate-300 rounded-lg pl-9 pr-3 py-2 font-mono bg-white text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">신규 비밀번호 (본인 전용)</label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="8자 이상 (영문 + 숫자 필수 포함)"
                required
                autoFocus={isForced}
                className="w-full border border-slate-300 rounded-lg pl-9 pr-3 py-2 font-mono bg-white text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">신규 비밀번호 확인</label>
            <div className="relative">
              <ShieldCheck className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="신규 비밀번호 재입력"
                required
                className="w-full border border-slate-300 rounded-lg pl-9 pr-3 py-2 font-mono bg-white text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
          </div>

          {/* 사내 보안 정책 실시간 체크리스트 */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1.5 text-[11px]">
            <div className="font-bold text-slate-700 mb-1">사내 비밀번호 보안 정책 안내</div>
            <div
              className={`flex items-center gap-1.5 ${
                isNotDefault1234 ? 'text-emerald-700 font-bold' : 'text-slate-500'
              }`}
            >
              <CheckCircle2
                className={`w-3.5 h-3.5 ${isNotDefault1234 ? 'text-emerald-600' : 'text-slate-300'}`}
              />
              <span>초기 비밀번호('1234') 사용 불가</span>
            </div>
            <div
              className={`flex items-center gap-1.5 ${
                isMinLength ? 'text-emerald-700 font-bold' : 'text-slate-500'
              }`}
            >
              <CheckCircle2
                className={`w-3.5 h-3.5 ${isMinLength ? 'text-emerald-600' : 'text-slate-300'}`}
              />
              <span>최소 8자 이상 입력</span>
            </div>
            <div
              className={`flex items-center gap-1.5 ${
                hasLetter && hasNumber ? 'text-emerald-700 font-bold' : 'text-slate-500'
              }`}
            >
              <CheckCircle2
                className={`w-3.5 h-3.5 ${
                  hasLetter && hasNumber ? 'text-emerald-600' : 'text-slate-300'
                }`}
              />
              <span>
                영문 및 숫자 필수 포함 {hasSpecial ? '(특수문자 포함 완료 ✓)' : '(특수문자 조합 권장)'}
              </span>
            </div>
            <div
              className={`flex items-center gap-1.5 ${
                isMatch ? 'text-emerald-700 font-bold' : 'text-slate-500'
              }`}
            >
              <CheckCircle2
                className={`w-3.5 h-3.5 ${isMatch ? 'text-emerald-600' : 'text-slate-300'}`}
              />
              <span>신규 비밀번호 및 확인 일치</span>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            {isForced ? (
              onLogoutInstead && (
                <button
                  type="button"
                  onClick={onLogoutInstead}
                  className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>로그아웃</span>
                </button>
              )
            ) : (
              <button
                type="button"
                onClick={resetAndClose}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors cursor-pointer"
              >
                취소
              </button>
            )}
            <button
              type="submit"
              className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-xl shadow-md transition-all cursor-pointer"
            >
              {isForced ? '새 비밀번호 설정 완료 및 시작' : '비밀번호 변경 저장'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
