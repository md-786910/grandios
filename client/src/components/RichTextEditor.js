import { useEffect, useRef, useState, useCallback } from "react";

/**
 * Lightweight rich text editor based on contentEditable + document.execCommand.
 * - `value` is HTML string (kept in sync only when externally changed)
 * - `onChange` receives the updated HTML string
 *
 * Note: execCommand is deprecated but still supported in all major browsers
 * and is sufficient for simple inline formatting without adding dependencies.
 */
const TEXT_COLORS = [
  "#000000", "#374151", "#6b7280", "#9ca3af", "#d1d5db", "#ffffff",
  "#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16", "#22c55e",
  "#10b981", "#06b6d4", "#0ea5e9", "#3b82f6", "#6366f1", "#8b5cf6",
  "#a855f7", "#ec4899", "#f43f5e", "#dc2626", "#7c3aed", "#0891b2",
];

const HIGHLIGHT_COLORS = [
  "transparent",
  "#fef3c7", "#fee2e2", "#dcfce7", "#dbeafe", "#ede9fe",
  "#fce7f3", "#fef08a", "#fecaca", "#bbf7d0", "#bfdbfe", "#e9d5ff",
];

const TYPOGRAPHY_OPTIONS = [
  { label: "Normaler Text", tag: "p", className: "text-sm" },
  { label: "Überschrift 1", tag: "h1", className: "text-2xl font-bold" },
  { label: "Überschrift 2", tag: "h2", className: "text-xl font-bold" },
  { label: "Überschrift 3", tag: "h3", className: "text-lg font-semibold" },
  { label: "Überschrift 4", tag: "h4", className: "text-base font-semibold" },
  { label: "Zitat", tag: "blockquote", className: "italic text-gray-600" },
  { label: "Code", tag: "pre", className: "font-mono text-xs" },
];

const ColorSwatch = ({ color, onSelect, isTransparent }) => (
  <button
    type="button"
    onMouseDown={(e) => e.preventDefault()}
    onClick={() => onSelect(color)}
    title={color}
    className="w-6 h-6 rounded border border-gray-300 hover:ring-2 hover:ring-offset-1 hover:ring-blue-400 transition-all"
    style={
      isTransparent
        ? {
            backgroundImage:
              "linear-gradient(45deg, #ddd 25%, transparent 25%, transparent 75%, #ddd 75%), linear-gradient(45deg, #ddd 25%, transparent 25%, transparent 75%, #ddd 75%)",
            backgroundSize: "8px 8px",
            backgroundPosition: "0 0, 4px 4px",
          }
        : { backgroundColor: color }
    }
  />
);

const Popover = ({ anchorRef, children, onClose }) => {
  const ref = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0, placement: "bottom" });

  // Position relative to the anchor using fixed positioning so it escapes
  // any ancestor with `overflow: hidden`. Auto-flip if not enough room below.
  useEffect(() => {
    const place = () => {
      const anchor = anchorRef?.current;
      const pop = ref.current;
      if (!anchor || !pop) return;
      const a = anchor.getBoundingClientRect();
      const popH = pop.offsetHeight;
      const popW = pop.offsetWidth;
      const spaceBelow = window.innerHeight - a.bottom;
      const placeAbove = spaceBelow < popH + 8 && a.top > popH + 8;
      const top = placeAbove ? a.top - popH - 4 : a.bottom + 4;
      let left = a.left;
      // Keep popover within the viewport horizontally
      if (left + popW > window.innerWidth - 8) {
        left = Math.max(8, window.innerWidth - popW - 8);
      }
      setPos({ top, left, placement: placeAbove ? "top" : "bottom" });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchorRef]);

  useEffect(() => {
    const handler = (e) => {
      if (
        ref.current &&
        !ref.current.contains(e.target) &&
        !anchorRef?.current?.contains(e.target)
      ) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose, anchorRef]);

  return (
    <div
      ref={ref}
      style={{ position: "fixed", top: pos.top, left: pos.left }}
      className="z-50 p-3 bg-white border border-gray-200 rounded-lg shadow-xl"
    >
      {children}
    </div>
  );
};

const ToolbarButton = ({ onClick, title, active, children, style }) => (
  <button
    type="button"
    onMouseDown={(e) => e.preventDefault()}
    onClick={onClick}
    title={title}
    className={`w-8 h-8 flex items-center justify-center text-sm rounded transition-colors ${
      active
        ? "bg-blue-100 text-blue-700"
        : "text-gray-700 hover:bg-gray-200"
    }`}
    style={style}
  >
    {children}
  </button>
);

const Divider = () => (
  <span className="w-px h-5 bg-gray-300 mx-0.5 self-center" />
);

const RichTextEditor = ({
  value,
  onChange,
  placeholder = "",
  className = "",
  editorClassName = "",
}) => {
  const editorRef = useRef(null);
  const typoAnchorRef = useRef(null);
  const colorAnchorRef = useRef(null);
  const highlightAnchorRef = useRef(null);
  const [activePopover, setActivePopover] = useState(null); // 'color' | 'highlight' | 'typo' | null
  const [currentColor, setCurrentColor] = useState("#ef4444");
  const [currentHighlight, setCurrentHighlight] = useState("#fef08a");

  // Sync incoming value when it differs from current DOM (e.g. reset/discard)
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if ((value || "") !== el.innerHTML) {
      el.innerHTML = value || "";
    }
  }, [value]);

  const exec = useCallback(
    (cmd, arg = null) => {
      editorRef.current?.focus();
      document.execCommand(cmd, false, arg);
      if (editorRef.current) {
        onChange(editorRef.current.innerHTML);
      }
    },
    [onChange],
  );

  const handleInput = () => {
    if (editorRef.current) onChange(editorRef.current.innerHTML);
  };

  // Paste as plain text to avoid pulling in foreign styles/markup
  const handlePaste = (e) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, text);
  };

  const handleLink = () => {
    const url = window.prompt("Link-URL eingeben:", "https://");
    if (url) exec("createLink", url);
  };

  const applyColor = (c) => {
    setCurrentColor(c);
    exec("foreColor", c);
    setActivePopover(null);
  };

  const applyHighlight = (c) => {
    setCurrentHighlight(c);
    exec("hiliteColor", c);
    setActivePopover(null);
  };

  const applyBlock = (tag) => {
    exec("formatBlock", tag);
    setActivePopover(null);
  };

  const togglePopover = (name) =>
    setActivePopover((curr) => (curr === name ? null : name));

  const isEmpty = !value || value === "<br>" || value === "<div><br></div>";

  return (
    <div className={`flex flex-col ${className}`}>
      <div className="flex items-center gap-0.5 flex-wrap border border-b-0 rounded-t-lg bg-gray-50 px-2 py-1.5">
        {/* Typography / block format */}
        <div className="relative">
          <button
            ref={typoAnchorRef}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => togglePopover("typo")}
            title="Typografie"
            className="h-8 px-2 flex items-center gap-1 text-xs font-medium text-gray-700 hover:bg-gray-200 rounded transition-colors"
          >
            <span>Stil</span>
            <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 011.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
                clipRule="evenodd"
              />
            </svg>
          </button>
          {activePopover === "typo" && (
            <Popover
              anchorRef={typoAnchorRef}
              onClose={() => setActivePopover(null)}
            >
              <div className="flex flex-col w-48">
                {TYPOGRAPHY_OPTIONS.map((opt) => (
                  <button
                    key={opt.tag}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => applyBlock(opt.tag)}
                    className={`text-left px-3 py-1.5 hover:bg-gray-100 rounded ${opt.className}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </Popover>
          )}
        </div>

        <Divider />

        {/* Inline formatting */}
        <ToolbarButton
          onClick={() => exec("bold")}
          title="Fett (Ctrl+B)"
          style={{ fontWeight: 700 }}
        >
          B
        </ToolbarButton>
        <ToolbarButton
          onClick={() => exec("italic")}
          title="Kursiv (Ctrl+I)"
          style={{ fontStyle: "italic" }}
        >
          I
        </ToolbarButton>
        <ToolbarButton
          onClick={() => exec("underline")}
          title="Unterstrichen (Ctrl+U)"
          style={{ textDecoration: "underline" }}
        >
          U
        </ToolbarButton>
        <ToolbarButton
          onClick={() => exec("strikeThrough")}
          title="Durchgestrichen"
          style={{ textDecoration: "line-through" }}
        >
          S
        </ToolbarButton>

        <Divider />

        {/* Text color — split button: click swatch to apply current, click arrow to open palette */}
        <div
          ref={colorAnchorRef}
          className="relative flex items-stretch h-8 rounded hover:bg-gray-200"
        >
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => exec("foreColor", currentColor)}
            title="Textfarbe anwenden"
            className="px-1.5 flex flex-col items-center justify-center"
          >
            <span className="leading-none text-sm font-semibold text-gray-800">
              A
            </span>
            <span
              className="block w-4 h-1 mt-0.5 rounded-sm border border-gray-300"
              style={{ backgroundColor: currentColor }}
            />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => togglePopover("color")}
            title="Farbe wählen"
            className="px-0.5 flex items-center text-gray-600"
          >
            <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 011.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
                clipRule="evenodd"
              />
            </svg>
          </button>
          {activePopover === "color" && (
            <Popover
              anchorRef={colorAnchorRef}
              onClose={() => setActivePopover(null)}
            >
              <div className="mb-2 text-xs font-medium text-gray-600">
                Textfarbe
              </div>
              <div className="grid grid-cols-6 gap-1.5">
                {TEXT_COLORS.map((c) => (
                  <ColorSwatch key={c} color={c} onSelect={applyColor} />
                ))}
              </div>
              <div className="mt-3 pt-2 border-t border-gray-100 flex items-center gap-2">
                <label className="text-xs text-gray-600">Eigene:</label>
                <input
                  type="color"
                  value={currentColor}
                  onChange={(e) => applyColor(e.target.value)}
                  className="w-8 h-7 rounded border border-gray-300 cursor-pointer"
                />
              </div>
            </Popover>
          )}
        </div>

        {/* Highlight color */}
        <div
          ref={highlightAnchorRef}
          className="relative flex items-stretch h-8 rounded hover:bg-gray-200"
        >
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => exec("hiliteColor", currentHighlight)}
            title="Markierung anwenden"
            className="px-1.5 flex flex-col items-center justify-center"
          >
            <span
              className="leading-none text-sm font-semibold px-1 rounded-sm"
              style={{ backgroundColor: currentHighlight }}
            >
              H
            </span>
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => togglePopover("highlight")}
            title="Markierung wählen"
            className="px-0.5 flex items-center text-gray-600"
          >
            <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 011.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
                clipRule="evenodd"
              />
            </svg>
          </button>
          {activePopover === "highlight" && (
            <Popover
              anchorRef={highlightAnchorRef}
              onClose={() => setActivePopover(null)}
            >
              <div className="mb-2 text-xs font-medium text-gray-600">
                Hintergrundfarbe
              </div>
              <div className="grid grid-cols-6 gap-1.5">
                {HIGHLIGHT_COLORS.map((c) => (
                  <ColorSwatch
                    key={c}
                    color={c}
                    onSelect={applyHighlight}
                    isTransparent={c === "transparent"}
                  />
                ))}
              </div>
            </Popover>
          )}
        </div>

        <Divider />

        {/* Lists */}
        <ToolbarButton
          onClick={() => exec("insertUnorderedList")}
          title="Aufzählung"
        >
          •
        </ToolbarButton>
        <ToolbarButton
          onClick={() => exec("insertOrderedList")}
          title="Nummerierte Liste"
        >
          1.
        </ToolbarButton>

        {/* Indent */}
        <ToolbarButton onClick={() => exec("outdent")} title="Ausrücken">
          ⇤
        </ToolbarButton>
        <ToolbarButton onClick={() => exec("indent")} title="Einrücken">
          ⇥
        </ToolbarButton>

        <Divider />

        {/* Alignment */}
        <ToolbarButton onClick={() => exec("justifyLeft")} title="Links">
          ⯇
        </ToolbarButton>
        <ToolbarButton onClick={() => exec("justifyCenter")} title="Zentriert">
          ≡
        </ToolbarButton>
        <ToolbarButton onClick={() => exec("justifyRight")} title="Rechts">
          ⯈
        </ToolbarButton>

        <Divider />

        {/* Link */}
        <ToolbarButton onClick={handleLink} title="Link einfügen">
          🔗
        </ToolbarButton>

        {/* Clear formatting */}
        <ToolbarButton
          onClick={() => exec("removeFormat")}
          title="Formatierung entfernen"
        >
          ⌫
        </ToolbarButton>
      </div>
      <div className="relative flex-1">
        {isEmpty && placeholder && (
          <span className="absolute left-3 top-3 text-sm text-gray-400 pointer-events-none">
            {placeholder}
          </span>
        )}
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          onPaste={handlePaste}
          className={`w-full h-full min-h-[120px] outline-none p-3 text-sm overflow-auto ${editorClassName}`}
        />
      </div>
    </div>
  );
};

export default RichTextEditor;
