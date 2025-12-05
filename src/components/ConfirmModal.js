import React from "react";

const ConfirmModal = ({
  isOpen,
  onClose,
  onConfirm,
  title = "BESTÄTIGEN",
  message = "Sind Sie sicher?",
  confirmText = "Ja",
  cancelText = "Stornieren",
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/20"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-lg shadow-lg w-full max-w-sm mx-4">
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
        <div className="px-5 py-8">
          <p className="text-center text-gray-700 text-sm">{message}</p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-center gap-4 px-5 pb-6">
          <button
            onClick={onConfirm}
            className="min-w-[100px] px-6 py-2.5 bg-gray-800 text-white rounded-md hover:bg-gray-700 transition-colors text-sm font-medium"
          >
            {confirmText}
          </button>
          <button
            onClick={onClose}
            className="min-w-[100px] px-6 py-2.5 bg-gray-800 text-white rounded-md hover:bg-gray-700 transition-colors text-sm font-medium"
          >
            {cancelText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;
