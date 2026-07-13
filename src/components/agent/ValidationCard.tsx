/**
 * ValidationCard — Shows validation result with clear pass/fail visual.
 *
 * Green: valid combination, ready to generate
 * Red: invalid combination with prominent UNSAFE flag, errors + fix suggestions
 * Amber: warnings that need review
 */

import { CheckCircle, XCircle, AlertTriangle, ShieldCheck, ShieldX, ShieldAlert, OctagonX } from "lucide-react";
import { SuggestionCard, SuggestionItem } from "./SuggestionCard";

interface ValidationCardProps {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: SuggestionItem[];
  onSuggestionSelect: (s: SuggestionItem) => void;
}

export function ValidationCard({
  isValid,
  errors,
  warnings,
  suggestions,
  onSuggestionSelect,
}: ValidationCardProps) {
  const hasErrors = errors.length > 0;
  const hasWarnings = warnings.length > 0;
  const totalIssues = errors.length + warnings.length;

  return (
    <div
      className={`rounded-xl border-2 p-4 my-3 shadow-sm ${
        hasErrors
          ? "border-red-400 bg-gradient-to-br from-red-50 to-rose-50 shadow-red-100"
          : isValid && !hasWarnings
            ? "border-green-300 bg-gradient-to-br from-green-50 to-emerald-50"
            : "border-amber-300 bg-gradient-to-br from-amber-50 to-yellow-50"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2.5">
          {hasErrors ? (
            <div className="p-1.5 rounded-lg bg-red-100 animate-pulse">
              <ShieldX className="w-5 h-5 text-red-600" />
            </div>
          ) : isValid && !hasWarnings ? (
            <div className="p-1.5 rounded-lg bg-green-100">
              <ShieldCheck className="w-4 h-4 text-green-600" />
            </div>
          ) : (
            <div className="p-1.5 rounded-lg bg-amber-100">
              <ShieldAlert className="w-4 h-4 text-amber-600" />
            </div>
          )}
          <span className={`font-semibold text-sm ${
            hasErrors ? "text-red-800" : isValid && !hasWarnings ? "text-green-800" : "text-amber-800"
          }`}>
            {hasErrors ? "Invalid Combination" : isValid && !hasWarnings ? "Valid Combination" : "Valid with Warnings"}
          </span>
        </div>
        {totalIssues > 0 && (
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
            hasErrors ? "bg-red-200 text-red-800" : "bg-amber-200 text-amber-800"
          }`}>
            {totalIssues} {totalIssues === 1 ? "issue" : "issues"}
          </span>
        )}
      </div>

      {/* UNSAFE banner for errors */}
      {hasErrors && (
        <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-red-600 rounded-lg">
          <OctagonX className="w-4 h-4 text-white flex-shrink-0" />
          <span className="text-sm font-bold text-white tracking-wide">
            UNSAFE SPECIFICATION — Do not proceed without resolving
          </span>
        </div>
      )}

      {/* Errors */}
      {hasErrors && (
        <div className="space-y-2 mb-3">
          {errors.map((err, i) => (
            <div key={i} className="flex items-start gap-2 text-sm text-red-700 bg-red-100/70 rounded-lg px-3 py-2 border border-red-200">
              <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0 text-red-600" />
              <span className="font-medium">{err}</span>
            </div>
          ))}
        </div>
      )}

      {/* Warnings */}
      {hasWarnings && (
        <div className="space-y-1.5 mb-3">
          {warnings.map((warn, i) => (
            <div key={i} className="flex items-start gap-2 text-sm text-amber-700 bg-amber-100/50 rounded-lg px-3 py-1.5 border border-amber-200">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-600" />
              <span>{warn}</span>
            </div>
          ))}
        </div>
      )}

      {/* Fix suggestion chips */}
      {!isValid && suggestions.length > 0 && (
        <div className="mt-3 pt-3 border-t border-red-200/50">
          <p className="text-xs font-medium text-gray-500 mb-2">Suggested fixes:</p>
          <SuggestionCard suggestions={suggestions} onSelect={onSuggestionSelect} />
        </div>
      )}

      {isValid && !hasErrors && !hasWarnings && (
        <div className="flex items-center gap-1.5 mt-1">
          <CheckCircle className="w-3.5 h-3.5 text-green-500" />
          <p className="text-sm text-green-700">Ready to generate datasheet.</p>
        </div>
      )}

      {isValid && hasWarnings && !hasErrors && (
        <div className="flex items-center gap-1.5 mt-1">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
          <p className="text-sm text-amber-700">Review warnings above before proceeding.</p>
        </div>
      )}
    </div>
  );
}
