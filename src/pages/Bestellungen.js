import React, { useState } from "react";
import Layout from "../components/Layout";
import ConfirmModal from "../components/ConfirmModal";

const initialOrderData = {
  id: 1,
  orderNumber: "GRAND01298",
  orderDate: "08-01-2025",
  rabattWert: "80,92",
  gesamtBestellwert: "459,50",
  gesamtOhneVerkauf: "108,88",
  customer: {
    kundennummer: "Kundennummer_123",
    kundenname: "Jane Doe",
    email: "jane_doe@gmail.com",
    telefon: "+44 (0) 12345678",
    adresse: {
      strasse: "Robijnstraat 38",
      plz: "1234 RB Alkmaar",
      stadt: "Wien",
    },
  },
  items: [
    {
      id: 1,
      name: "Rucksack/Tasche Cognacbraun",
      price: "129,90",
      originalPrice: null,
      color: "Cognac",
      material: "Leder",
      artikelnummer: "",
      rabattberechtigt: true,
      image: "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=150&h=150&fit=crop",
    },
    {
      id: 2,
      name: "Pullover GRANGRIS",
      price: "48,93",
      originalPrice: "69,90",
      color: "Grau meliert",
      material: "100 % Polyester",
      artikelnummer: "",
      rabattberechtigt: false,
      image: "https://images.unsplash.com/photo-1620799140408-edc6dcb6d633?w=150&h=150&fit=crop",
    },
    {
      id: 3,
      name: "Strickjacke GRANPIAF",
      price: "49,90",
      originalPrice: null,
      color: "Schwarz/Offwhite gestreift",
      material: "70 % Nylon, 30 % Acryl",
      artikelnummer: "",
      rabattberechtigt: true,
      image: "https://images.unsplash.com/photo-1434389677669-e08b4cac3105?w=150&h=150&fit=crop",
    },
    {
      id: 4,
      name: "Jacke GRANTIFFANY",
      price: "89,90",
      originalPrice: null,
      color: "Pink/Rot/Blau gemustert",
      material: "100 % Polyester",
      artikelnummer: "",
      rabattberechtigt: true,
      image: "https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=150&h=150&fit=crop",
    },
    {
      id: 5,
      name: "Hose GRANJODIE - Hellblau",
      price: "59,95",
      originalPrice: "119,90",
      color: "Hellblau",
      material: "61 % Baumwolle, 37 % Polyester, 2 % Elasthan",
      artikelnummer: "",
      rabattberechtigt: false,
      image: "https://images.unsplash.com/photo-1542272604-787c3835535d?w=150&h=150&fit=crop",
    },
  ],
};

const Bestellungen = () => {
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(initialOrderData);
  const [backupOrder, setBackupOrder] = useState(null);
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, itemId: null });

  // Open delete confirmation modal
  const handleOpenDeleteModal = (itemId) => {
    setDeleteModal({ isOpen: true, itemId });
  };

  // Close delete confirmation modal
  const handleCloseDeleteModal = () => {
    setDeleteModal({ isOpen: false, itemId: null });
  };

  // Confirm delete
  const handleConfirmDelete = () => {
    if (deleteModal.itemId) {
      setSelectedOrder((prev) => ({
        ...prev,
        items: prev.items.filter((item) => item.id !== deleteModal.itemId),
      }));
    }
    handleCloseDeleteModal();
  };

  // Toggle rabatt checkbox
  const handleToggleRabatt = (itemId) => {
    setSelectedOrder((prev) => ({
      ...prev,
      items: prev.items.map((item) =>
        item.id === itemId
          ? { ...item, rabattberechtigt: !item.rabattberechtigt }
          : item
      ),
    }));
  };

  // Enter edit mode
  const handleEnterEditMode = () => {
    setBackupOrder(JSON.parse(JSON.stringify(selectedOrder)));
    setIsEditMode(true);
  };

  // Save changes
  const handleSave = () => {
    setBackupOrder(null);
    setIsEditMode(false);
  };

  // Cancel changes
  const handleCancel = () => {
    if (backupOrder) {
      setSelectedOrder(backupOrder);
    }
    setBackupOrder(null);
    setIsEditMode(false);
  };

  return (
    <Layout>
      {/* Header with Order Number and Back Button */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <span className="text-gray-600 font-medium">Bestellnummer:</span>
          <span className="bg-gray-100 px-4 py-2 rounded-lg font-semibold text-gray-900">
            {selectedOrder.orderNumber}
          </span>
        </div>
        <button className="px-6 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors">
          Zurück
        </button>
      </div>

      {/* Stats Section - Kundendetails on left, 2x2 grid on right */}
      <div className="flex gap-4 mb-6">
        {/* Customer Details - Left Column */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 w-[400px]">
          <h3 className="text-center font-semibold text-gray-900 mb-6">Kundendetails</h3>
          <div className="space-y-3 text-sm">
            <div className="flex">
              <span className="text-gray-500 w-36">Kundennummer:</span>
              <span className="text-gray-900">{selectedOrder.customer.kundennummer}</span>
            </div>
            <div className="flex">
              <span className="text-gray-500 w-36">Kundenname:</span>
              <span className="text-gray-900">{selectedOrder.customer.kundenname}</span>
            </div>
            <div className="flex">
              <span className="text-gray-500 w-36">E-Mail:</span>
              <span className="text-gray-900">{selectedOrder.customer.email}</span>
            </div>
            <div className="flex">
              <span className="text-gray-500 w-36">Telefonnummer :</span>
              <span className="text-gray-900">{selectedOrder.customer.telefon}</span>
            </div>
            <div className="flex">
              <span className="text-gray-500 w-36">Adresse :</span>
              <div className="text-gray-900">
                <div>{selectedOrder.customer.adresse.strasse}</div>
                <div>{selectedOrder.customer.adresse.plz}</div>
                <div>{selectedOrder.customer.adresse.stadt}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column - 2x2 Grid */}
        <div className="flex-1 grid grid-cols-2 gap-4">
          {/* Order Date */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 flex flex-col items-center justify-center">
            <h3 className="font-semibold text-gray-900 mb-4">Bestelldatum</h3>
            <p className="text-3xl font-bold text-gray-900">
              {selectedOrder.orderDate}
            </p>
          </div>

          {/* Discount Value */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 flex flex-col items-center justify-center">
            <h3 className="font-semibold text-gray-900 mb-4">Rabattwert</h3>
            <p className="text-3xl font-bold text-gray-900">
              € {selectedOrder.rabattWert}
            </p>
          </div>

          {/* Total Order Value */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 flex flex-col items-center justify-center">
            <h3 className="font-semibold text-gray-900 mb-4">Gesamtbestellwert</h3>
            <p className="text-3xl font-bold text-gray-900">
              € {selectedOrder.gesamtBestellwert}
            </p>
          </div>

          {/* Total Without Sales Items */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 flex flex-col items-center justify-center">
            <h3 className="font-semibold text-gray-900 mb-4">Gesamtbestellwert Ohne Verkaufsartikel</h3>
            <p className="text-3xl font-bold text-gray-900">
              € {selectedOrder.gesamtOhneVerkauf}
            </p>
          </div>
        </div>
      </div>

      {/* Purchase History */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-semibold text-gray-900 text-lg">Kaufhistorie</h3>
          {isEditMode ? (
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors text-sm"
              >
                Speichern
              </button>
              <button
                onClick={handleCancel}
                className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors text-sm"
              >
                Stornieren
              </button>
            </div>
          ) : (
            <button
              onClick={handleEnterEditMode}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          {selectedOrder.items.map((item) => (
            <div key={item.id} className="flex gap-4 p-4 border border-gray-200 rounded-xl">
              <img
                src={item.image}
                alt={item.name}
                className="w-24 h-24 object-cover rounded-lg"
              />
              <div className="flex-1">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-semibold text-gray-900">{item.name}</h4>
                    <div className="flex items-center gap-2 mt-1">
                      {item.originalPrice ? (
                        <>
                          <span className="text-red-500 font-semibold">€ {item.price}</span>
                          <span className="text-gray-400 line-through text-sm">€ {item.originalPrice}</span>
                        </>
                      ) : (
                        <span className="text-gray-900">€ {item.price}</span>
                      )}
                    </div>
                  </div>
                  {isEditMode ? (
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={item.rabattberechtigt}
                          onChange={() => handleToggleRabatt(item.id)}
                          className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                        />
                        <span className="text-sm text-gray-700">Rabatt</span>
                      </label>
                      <button
                        onClick={() => handleOpenDeleteModal(item.id)}
                        className="p-1.5 text-red-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  ) : (
                    item.rabattberechtigt && (
                      <span className="text-green-600 text-sm font-medium">Rabattberechtigt</span>
                    )
                  )}
                </div>
                <p className="text-sm text-gray-600 mt-2">
                  Farbe: {item.color} | Material: {item.material}
                </p>
                <p className="text-sm text-gray-600">
                  Artikelnummer: {item.artikelnummer}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={deleteModal.isOpen}
        onClose={handleCloseDeleteModal}
        onConfirm={handleConfirmDelete}
        title="ARTIKEL LÖSCHEN"
        message="Möchten Sie diesen Artikel wirklich löschen?"
        confirmText="Ja"
        cancelText="Stornieren"
      />
    </Layout>
  );
};

export default Bestellungen;
