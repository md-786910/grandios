import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const UnsavedChangesModal = ({
  isOpen,
  onClose,
  onDiscard,
  onSave,
  saving = false,
  title = "Nicht gespeicherte Änderungen",
  message = "Sie haben nicht gespeicherte Änderungen. Möchten Sie diese speichern oder verwerfen?",
}) => {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const portalRef = useRef(null);

  useEffect(() => {
    const portalRoot = document.createElement("div");
    portalRoot.setAttribute("data-modal-root", "true");
    document.body.appendChild(portalRoot);
    portalRef.current = portalRoot;
    setMounted(true);

    return () => {
      if (portalRef.current) {
        portalRef.current.remove();
        portalRef.current = null;
      }
    };
  }, []);

  // Handle animation states
  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
    }
  }, [isOpen]);

  if (!mounted || !isOpen || !portalRef.current) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-200 ease-out ${
          visible ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className={`relative bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden transition-all duration-200 ease-out ${
          visible ? "opacity-100 scale-100" : "opacity-0 scale-95"
        }`}
      >
        {/* Warning Icon */}
        <div className="pt-6 pb-2 flex justify-center">
          <div className="w-12 h-12 rounded-full bg-orange-50 flex items-center justify-center">
            <svg
              className="w-6 h-6 text-orange-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 pb-2 text-center">
          <h3 className="text-base font-semibold text-gray-900 mb-2">
            {title}
          </h3>
          <p className="text-sm text-gray-500 leading-relaxed">{message}</p>
        </div>

        {/* Actions */}
        <div className="p-4 pt-4 flex flex-col gap-2">
          <button
            onClick={onSave}
            disabled={saving}
            className="w-full py-2.5 bg-orange-600 text-white rounded-lg hover:bg-orange-700 active:scale-[0.98] transition-all duration-150 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                Speichern...
              </>
            ) : (
              "Speichern & Fortfahren"
            )}
          </button>
          <button
            onClick={onDiscard}
            className="w-full py-2.5 text-red-600 bg-red-50 rounded-lg hover:bg-red-100 active:scale-[0.98] transition-all duration-150 text-sm font-medium"
          >
            Verwerfen
          </button>
          <button
            onClick={onClose}
            className="w-full py-2.5 text-orange-600 hover:text-orange-700 hover:bg-orange-50 rounded-lg active:scale-[0.98] transition-all duration-150 text-sm font-medium"
          >
            Abbrechen
          </button>
        </div>
      </div>
    </div>,
    portalRef.current
  );
};

export default UnsavedChangesModal;
