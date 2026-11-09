import React, { useState } from 'react';
import { Lock, KeyRound, User, CheckCircle2, AlertCircle, X, ShieldCheck } from 'lucide-react';

interface PasswordChangeModalProps {
  isOpen: boolean;
  onClose: () => void;
  userPasswords: Record<string, string>;
  onChangePassword: (username: string, newPassword: string) => void;
}

const VALID_USERNAMES = ['admin', 'field1', 'office1'];

export const PasswordChangeModal: React.FC<PasswordChangeModalProps> = ({
  isOpen,
  onClose,
  userPasswords,
  onChangePassword,
}) => {
  const [targetUsername, setTargetUsername] = useState('admin');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  if (!isOpen) return null;

  // 사내 보안 정책 유효성 검사 지표
  const isMinLength = newPassword.length >= 8;
  const hasLetter = /[a-zA-Z]/.test(newPassword);
  const hasNumber = /[0-9]/.test(newPassword);
  const hasSpecial = /[!@#$%^&*(),.?":{}|<>_\-+=/\\[\]~`]/.test(newPassword);
  const isMatch = newPassword.length > 0 && newPassword === confirmPassword;

  const resetAndClose = () => {
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

    const trimmedId = targetUsername.trim();
    if (!VALID_USERNAMES.includes(trimmedId)) {
      setErrorMsg('등록되지 않은 사내 계정 아이디입니다. (admin, field1, office1)');
      return;
    }

    const storedPassword = userPasswords[trimmedId];
    const isCurrentValid = storedPassword
      ? currentPassword === storedPassword
      : currentPassword === '1234' || currentPassword === 'admin123!';

    if (!isCurrentValid) {
      setErrorMsg('현재 비밀번호가 일치하지 않습니다.');
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
    setSuccessMsg(`'${trimmedId}' 계정의 비밀번호가 성공적으로 변경되었습니다.`);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');

    setTimeout(() => {
      resetAndClose();
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
              <KeyRound className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-black tracking-tight text-white">사내 계정 비밀번호 변경</h3>
              <p className="text-[11px] text-slate-400">대성스틸 MRO 표준 보안 정책 적용</p>
            </div>
          </div>
          <button
            type="button"
            onClick={resetAndClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-3.5 text-xs">
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
                value={targetUsername}
                onChange={(e) => setTargetUsername(e.target.value)}
                placeholder="admin / field1 / office1"
                required
                className="w-full border border-slate-300 rounded-lg pl-9 pr-3 py-2 font-medium bg-white text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
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
                placeholder="현재 비밀번호 입력"
                required
                className="w-full border border-slate-300 rounded-lg pl-9 pr-3 py-2 font-mono bg-white text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">신규 비밀번호</label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="8자 이상 (영문, 숫자, 특수문자 조합 권장)"
                required
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
            <div className={`flex items-center gap-1.5 ${isMinLength ? 'text-emerald-700 font-bold' : 'text-slate-500'}`}>
              <CheckCircle2 className={`w-3.5 h-3.5 ${isMinLength ? 'text-emerald-600' : 'text-slate-300'}`} />
              <span>최소 8자 이상 입력</span>
            </div>
            <div className={`flex items-center gap-1.5 ${hasLetter && hasNumber ? 'text-emerald-700 font-bold' : 'text-slate-500'}`}>
              <CheckCircle2 className={`w-3.5 h-3.5 ${hasLetter && hasNumber ? 'text-emerald-600' : 'text-slate-300'}`} />
              <span>영문 및 숫자 필수 포함 {hasSpecial ? '(특수문자 포함 완료 ✓)' : '(특수문자 조합 권장)'}</span>
            </div>
            <div className={`flex items-center gap-1.5 ${isMatch ? 'text-emerald-700 font-bold' : 'text-slate-500'}`}>
              <CheckCircle2 className={`w-3.5 h-3.5 ${isMatch ? 'text-emerald-600' : 'text-slate-300'}`} />
              <span>신규 비밀번호 및 확인 일치</span>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={resetAndClose}
              className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors cursor-pointer"
            >
              취소
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-xl shadow-md transition-all cursor-pointer"
            >
              비밀번호 변경 저장
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
