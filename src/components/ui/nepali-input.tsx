import React, { useRef, useState } from 'react';
import { getNepaliCandidates, transliterateRomanToNepali, transliterateRomanWord } from '../../lib/nepali-transliterate';
import { cn } from '../../lib/utils';

interface BaseNepaliProps {
  value: string;
  onValueChange: (value: string) => void;
  defaultAutoNepali?: boolean;
  showHelper?: boolean;
}

type NepaliInputProps = BaseNepaliProps & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>;
type NepaliTextareaProps = BaseNepaliProps &
  Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'>;

function extractTrailingRomanBeforeCaret(text: string, caret: number): {
  token: string;
  start: number;
  end: number;
} | null {
  const before = text.slice(0, caret);
  const match = before.match(/([A-Za-z0-9*~\\]+)$/);
  if (!match) return null;
  return {
    token: match[1],
    start: caret - match[1].length,
    end: caret,
  };
}

function convertCompletedTokenAtCaret(
  nextValue: string,
  caret: number
): { value: string; nextCaret: number } | null {
  const before = nextValue.slice(0, caret);
  const after = nextValue.slice(caret);
  // Matches: <romanToken><delimiter> right at the caret
  const m = before.match(/([A-Za-z0-9*~\\]+)([\s.,;।\-/?!:\n])$/);
  if (!m) return null;
  const romanToken = m[1];
  const delimiter = m[2];
  const converted = transliterateRomanWord(romanToken);
  const prefix = before.slice(0, before.length - romanToken.length - delimiter.length);
  const combinedBefore = prefix + converted + delimiter;
  return {
    value: combinedBefore + after,
    nextCaret: combinedBefore.length,
  };
}

export const NepaliInput = React.forwardRef<HTMLInputElement, NepaliInputProps>(
  ({ className, value, onValueChange, defaultAutoNepali = true, showHelper = true, onBlur, ...props }, forwardedRef) => {
    const innerRef = useRef<HTMLInputElement | null>(null);
    const [autoNepali, setAutoNepali] = useState(defaultAutoNepali);
    const [caretPos, setCaretPos] = useState<number>(value.length);

    const setRefs = (el: HTMLInputElement | null) => {
      innerRef.current = el;
      if (typeof forwardedRef === 'function') forwardedRef(el);
      else if (forwardedRef) forwardedRef.current = el;
    };

    const activeTokenInfo = autoNepali ? extractTrailingRomanBeforeCaret(value, caretPos) : null;
    const candidates = activeTokenInfo ? getNepaliCandidates(activeTokenInfo.token) : [];

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      const caret = e.target.selectionStart ?? raw.length;

      if (!autoNepali) {
        setCaretPos(caret);
        onValueChange(raw);
        return;
      }

      const convertedResult = convertCompletedTokenAtCaret(raw, caret);
      if (convertedResult) {
        onValueChange(convertedResult.value);
        setCaretPos(convertedResult.nextCaret);
        requestAnimationFrame(() => {
          if (innerRef.current && document.activeElement === innerRef.current) {
            innerRef.current.setSelectionRange(convertedResult.nextCaret, convertedResult.nextCaret);
          }
        });
        return;
      }

      setCaretPos(caret);
      onValueChange(raw);
    };

    const applyCandidate = (nepaliWord: string) => {
      if (!activeTokenInfo) return;
      const next = value.slice(0, activeTokenInfo.start) + nepaliWord + value.slice(activeTokenInfo.end);
      const nextPos = activeTokenInfo.start + nepaliWord.length;
      onValueChange(next);
      setCaretPos(nextPos);
      requestAnimationFrame(() => {
        if (innerRef.current) {
          innerRef.current.focus();
          innerRef.current.setSelectionRange(nextPos, nextPos);
        }
      });
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      if (autoNepali && /[A-Za-z0-9*~\\]/.test(value)) {
        const converted = transliterateRomanToNepali(value);
        if (converted !== value) {
          onValueChange(converted);
        }
      }
      onBlur?.(e);
    };

    return (
      <div className="space-y-1">
        <div className="relative">
          <input
            ref={setRefs}
            value={value}
            onChange={handleChange}
            onBlur={handleBlur}
            onKeyUp={(e) => setCaretPos(e.currentTarget.selectionStart ?? value.length)}
            onClick={(e) => setCaretPos(e.currentTarget.selectionStart ?? value.length)}
            className={cn(
              'flex h-10 w-full rounded-lg border border-[#E5E2DC] bg-white px-3 py-2 pr-16 text-sm text-[#0F172A] placeholder:text-[#78716C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B91C1C] focus-visible:border-transparent disabled:cursor-not-allowed disabled:opacity-50',
              className
            )}
            {...props}
          />
          <button
            type="button"
            tabIndex={-1}
            title={
              autoNepali
                ? 'रोमन बाट स्वतः नेपाली (Auto Nepali ON — क्लिक गरी बन्द गर्न मिल्छ)'
                : 'अंग्रेजी मोड (क्लिक गरी स्वतः नेपाली चालु गर्नुहोस्)'
            }
            onClick={() => setAutoNepali((prev) => !prev)}
            className={cn(
              'absolute right-1.5 top-1/2 -translate-y-1/2 px-2 py-0.5 rounded text-[10px] font-semibold border cursor-pointer transition-colors',
              autoNepali
                ? 'bg-[#15803D]/10 text-[#15803D] border-[#15803D]/30 hover:bg-[#15803D]/20'
                : 'bg-[#F3F1EC] text-[#57534E] border-[#E5E2DC] hover:bg-[#E5E2DC]'
            )}
          >
            {autoNepali ? 'अ ने' : 'EN'}
          </button>
        </div>

        {showHelper && autoNepali && candidates.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-[#57534E]">
            <span>नेपाली:</span>
            {candidates.map((cand, idx) => (
              <button
                key={`${cand}-${idx}`}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  applyCandidate(cand);
                }}
                className={cn(
                  'px-2 py-0.5 rounded border text-xs cursor-pointer transition-colors',
                  idx === 0
                    ? 'bg-[#FAF9F6] border-[#15803D]/40 text-[#0F172A] font-medium'
                    : 'bg-white border-[#E5E2DC] text-[#57534E] hover:bg-[#FAF9F6]'
                )}
              >
                {cand}
              </button>
            ))}
            <span className="text-[10px] text-[#78716C]">(Space थिच्दा स्वतः बन्छ)</span>
          </div>
        )}
      </div>
    );
  }
);
NepaliInput.displayName = 'NepaliInput';

export const NepaliTextarea = React.forwardRef<HTMLTextAreaElement, NepaliTextareaProps>(
  ({ className, value, onValueChange, defaultAutoNepali = true, showHelper = true, onBlur, ...props }, forwardedRef) => {
    const innerRef = useRef<HTMLTextAreaElement | null>(null);
    const [autoNepali, setAutoNepali] = useState(defaultAutoNepali);
    const [caretPos, setCaretPos] = useState<number>(value.length);

    const setRefs = (el: HTMLTextAreaElement | null) => {
      innerRef.current = el;
      if (typeof forwardedRef === 'function') forwardedRef(el);
      else if (forwardedRef) forwardedRef.current = el;
    };

    const activeTokenInfo = autoNepali ? extractTrailingRomanBeforeCaret(value, caretPos) : null;
    const candidates = activeTokenInfo ? getNepaliCandidates(activeTokenInfo.token) : [];

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const raw = e.target.value;
      const caret = e.target.selectionStart ?? raw.length;

      if (!autoNepali) {
        setCaretPos(caret);
        onValueChange(raw);
        return;
      }

      const convertedResult = convertCompletedTokenAtCaret(raw, caret);
      if (convertedResult) {
        onValueChange(convertedResult.value);
        setCaretPos(convertedResult.nextCaret);
        requestAnimationFrame(() => {
          if (innerRef.current && document.activeElement === innerRef.current) {
            innerRef.current.setSelectionRange(convertedResult.nextCaret, convertedResult.nextCaret);
          }
        });
        return;
      }

      setCaretPos(caret);
      onValueChange(raw);
    };

    const applyCandidate = (nepaliWord: string) => {
      if (!activeTokenInfo) return;
      const next = value.slice(0, activeTokenInfo.start) + nepaliWord + value.slice(activeTokenInfo.end);
      const nextPos = activeTokenInfo.start + nepaliWord.length;
      onValueChange(next);
      setCaretPos(nextPos);
      requestAnimationFrame(() => {
        if (innerRef.current) {
          innerRef.current.focus();
          innerRef.current.setSelectionRange(nextPos, nextPos);
        }
      });
    };

    const handleBlur = (e: React.FocusEvent<HTMLTextAreaElement>) => {
      if (autoNepali && /[A-Za-z0-9*~\\]/.test(value)) {
        const converted = transliterateRomanToNepali(value);
        if (converted !== value) {
          onValueChange(converted);
        }
      }
      onBlur?.(e);
    };

    return (
      <div className="space-y-1">
        <div className="relative">
          <textarea
            ref={setRefs}
            value={value}
            onChange={handleChange}
            onBlur={handleBlur}
            onKeyUp={(e) => setCaretPos(e.currentTarget.selectionStart ?? value.length)}
            onClick={(e) => setCaretPos(e.currentTarget.selectionStart ?? value.length)}
            className={cn(
              'flex min-h-[88px] w-full rounded-lg border border-[#E5E2DC] bg-white px-3 py-2 pr-16 text-sm text-[#0F172A] placeholder:text-[#78716C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B91C1C] focus-visible:border-transparent disabled:cursor-not-allowed disabled:opacity-50',
              className
            )}
            {...props}
          />
          <button
            type="button"
            tabIndex={-1}
            title={
              autoNepali
                ? 'रोमन बाट स्वतः नेपाली (Auto Nepali ON)'
                : 'अंग्रेजी मोड (क्लिक गरी स्वतः नेपाली चालु गर्नुहोस्)'
            }
            onClick={() => setAutoNepali((prev) => !prev)}
            className={cn(
              'absolute right-2 top-2 px-2 py-0.5 rounded text-[10px] font-semibold border cursor-pointer transition-colors',
              autoNepali
                ? 'bg-[#15803D]/10 text-[#15803D] border-[#15803D]/30 hover:bg-[#15803D]/20'
                : 'bg-[#F3F1EC] text-[#57534E] border-[#E5E2DC] hover:bg-[#E5E2DC]'
            )}
          >
            {autoNepali ? 'अ ने' : 'EN'}
          </button>
        </div>

        {showHelper && autoNepali && candidates.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-[#57534E]">
            <span>नेपाली:</span>
            {candidates.map((cand, idx) => (
              <button
                key={`${cand}-${idx}`}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  applyCandidate(cand);
                }}
                className={cn(
                  'px-2 py-0.5 rounded border text-xs cursor-pointer transition-colors',
                  idx === 0
                    ? 'bg-[#FAF9F6] border-[#15803D]/40 text-[#0F172A] font-medium'
                    : 'bg-white border-[#E5E2DC] text-[#57534E] hover:bg-[#FAF9F6]'
                )}
              >
                {cand}
              </button>
            ))}
            <span className="text-[10px] text-[#78716C]">(Space थिच्दा स्वतः बन्छ)</span>
          </div>
        )}
      </div>
    );
  }
);
NepaliTextarea.displayName = 'NepaliTextarea';
