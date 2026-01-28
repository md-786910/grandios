import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const UnsavedChangesModal = ({
  isOpen,
  onClose,
  onDiscard,
  onSave,
  saving = false,
  title = "NICHT GESPEICHERTE ÄNDERUNGEN",
  message = "Sie haben nicht gespeicherte Änderungen. Möchten Sie diese speichern oder verwerfen?",
}) => {
  const [mounted, setMounted] = useState(false);
  const portalRef = useRef(null);

  useEffect(() => {
    // Create a dedicated portal container for this modal instance
    const portalRoot = document.createElement("div");
    portalRoot.setAttribute("data-modal-root", "true");
    document.body.appendChild(portalRoot);
    portalRef.current = portalRoot;
    setMounted(true);

    return () => {
      // Clean up the portal container on unmount (safe even if already removed)
      if (portalRef.current) {
        portalRef.current.remove();
        portalRef.current = null;
      }
    };
  }, []);

  if (!mounted || !isOpen || !portalRef.current) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-lg shadow-lg w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-900 tracking-wider uppercase">
            {title}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="px-5 py-6">
          <p className="text-center text-gray-700 text-sm">{message}</p>
        </div>

        {/* Footer - Three buttons */}
        <div className="flex items-center justify-center gap-3 px-5 pb-6">
          <button
            onClick={onDiscard}
            className="px-4 py-2.5 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors text-sm font-medium"
          >
            Verwerfen
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="px-4 py-2.5 bg-gray-800 text-white rounded-md hover:bg-gray-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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
              "Speichern"
            )}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2.5 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors text-sm font-medium"
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
