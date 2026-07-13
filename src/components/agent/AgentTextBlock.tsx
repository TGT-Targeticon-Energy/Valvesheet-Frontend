/**
 * AgentTextBlock — Renders agent text with clickable VDS codes and basic markdown.
 *
 * Detects VDS codes (like BSFA1R, BLRA1NR, GAYMD20NJ) in the text and renders
 * them as clickable chips that trigger datasheet generation.
 * Also renders basic markdown: **bold**, headers (##), bullet lists.
 */

import { FileSpreadsheet } from "lucide-react";
import { cn } from "@/lib/utils";
import { Fragment, type ReactNode } from "react";

interface AgentTextBlockProps {
  text: string;
  onVdsClick: (vdsCode: string) => void;
}

// VDS code pattern: 2-3 letter prefix + piping class + end connection
// Examples: BSFA1R, BLRA1NR, GAYMD20NJ, CDPF1LNR, NEMD1NJ
const VDS_CODE_RE =
  /\b([A-Z]{2,4}(?:F|R)?(?:T|P|M)?(?:A|B|D|E|F|G|T)\d{1,2}(?:L?N?)?[RJFWSHT])\b/g;

function parseVdsCodes(
  text: string,
  onVdsClick: (code: string) => void,
): ReactNode[] {
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  VDS_CODE_RE.lastIndex = 0;

  while ((match = VDS_CODE_RE.exec(text)) !== null) {
    const code = match[1];
    const start = match.index;

    if (start > lastIndex) {
      parts.push(text.slice(lastIndex, start));
    }

    parts.push(
      <button
        key={`vds-${start}-${code}`}
        onClick={() => onVdsClick(code)}
        className={cn(
          "inline-flex items-center gap-1 px-2 py-0.5 mx-0.5",
          "rounded-md border border-amber-200 bg-amber-50",
          "text-amber-700 font-mono text-[13px] font-semibold",
          "hover:bg-amber-100 hover:border-amber-300 hover:shadow-sm",
          "active:scale-[0.97] transition-all duration-150 cursor-pointer",
          "align-baseline",
        )}
        title={`Click to generate datasheet for ${code}`}
      >
        <FileSpreadsheet className="w-3 h-3 flex-shrink-0" />
        {code}
      </button>,
    );

    lastIndex = start + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
}

function renderLine(
  line: string,
  lineIdx: number,
  onVdsClick: (code: string) => void,
): ReactNode {
  if (line.startsWith("### ")) {
    return (
      <h4
        key={lineIdx}
        className="text-sm font-bold text-gray-900 mt-3 mb-1"
      >
        {parseInline(line.slice(4), lineIdx, onVdsClick)}
      </h4>
    );
  }
  if (line.startsWith("## ")) {
    return (
      <h3
        key={lineIdx}
        className="text-sm font-bold text-gray-900 mt-4 mb-1.5"
      >
        {parseInline(line.slice(3), lineIdx, onVdsClick)}
      </h3>
    );
  }

  const numMatch = line.match(/^(\d+)\.\s+(.*)/);
  if (numMatch) {
    return (
      <div key={lineIdx} className="flex gap-2 ml-1 my-0.5">
        <span className="text-gray-400 font-medium text-sm flex-shrink-0 w-5 text-right">
          {numMatch[1]}.
        </span>
        <span className="text-sm text-gray-800">
          {parseInline(numMatch[2], lineIdx, onVdsClick)}
        </span>
      </div>
    );
  }

  if (line.startsWith("- ") || line.startsWith("* ")) {
    const bulletContent = line.slice(2);
    const isValidation = isValidationLine(bulletContent);
    return (
      <div key={lineIdx} className="flex gap-2 ml-1 my-0.5">
        <span className={cn("mt-1.5 flex-shrink-0", isValidation ? "text-red-400" : "text-gray-400")}>•</span>
        <span className={cn(
          "text-sm",
          isValidation
            ? "text-red-600"
            : "text-gray-800"
        )}>
          {parseInline(bulletContent, lineIdx, onVdsClick)}
        </span>
      </div>
    );
  }

  if (line.match(/^\s{2,}-\s/)) {
    const content = line.replace(/^\s+-\s/, "");
    return (
      <div key={lineIdx} className="flex gap-2 ml-5 my-0.5">
        <span className="text-gray-300 mt-1.5 flex-shrink-0">◦</span>
        <span className="text-sm text-gray-700">
          {parseInline(content, lineIdx, onVdsClick)}
        </span>
      </div>
    );
  }

  if (line.match(/^-{3,}$/) || line.match(/^\*{3,}$/)) {
    return <hr key={lineIdx} className="my-2 border-gray-200" />;
  }

  if (!line.trim()) {
    return <div key={lineIdx} className="h-2" />;
  }

  // Validation / error line — red underline styling
  if (isValidationLine(line)) {
    return (
      <p
        key={lineIdx}
        className="text-sm text-red-600 my-0.5 leading-relaxed"
      >
        {parseInline(line, lineIdx, onVdsClick)}
      </p>
    );
  }

  return (
    <p key={lineIdx} className="text-sm text-gray-800 my-0.5 leading-relaxed">
      {parseInline(line, lineIdx, onVdsClick)}
    </p>
  );
}

// Patterns that indicate a validation/error message from the agent
const VALIDATION_LINE_RE =
  /\b(cannot|can't|invalid|not valid|not allowed|incompatible|not supported|not applicable|only valid for|applies only to|not available|must not|shall not|prohibited|not recommended|does not apply|issue with|missing|incorrect|mismatch)\b/i;

function isValidationLine(line: string): boolean {
  return VALIDATION_LINE_RE.test(line);
}

function parseInline(
  text: string,
  keyPrefix: number,
  onVdsClick: (code: string) => void,
): ReactNode {
  const withVds = parseVdsCodes(text, onVdsClick);

  return withVds.map((part, i) => {
    if (typeof part !== "string") return <Fragment key={i}>{part}</Fragment>;

    const boldParts = part.split(/(\*\*[^*]+\*\*)/g);
    if (boldParts.length === 1) return <Fragment key={i}>{part}</Fragment>;

    return (
      <Fragment key={i}>
        {boldParts.map((bp, j) => {
          if (bp.startsWith("**") && bp.endsWith("**")) {
            return (
              <strong key={j} className="font-semibold text-gray-900">
                {bp.slice(2, -2)}
              </strong>
            );
          }
          return <Fragment key={j}>{bp}</Fragment>;
        })}
      </Fragment>
    );
  });
}

export function AgentTextBlock({ text, onVdsClick }: AgentTextBlockProps) {
  const lines = text.split("\n");

  return (
    <div className="mb-4 leading-relaxed">
      {lines.map((line, i) => renderLine(line, i, onVdsClick))}
    </div>
  );
}
