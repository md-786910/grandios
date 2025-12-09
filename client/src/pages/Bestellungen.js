import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import ConfirmModal from "../components/ConfirmModal";
import { ordersAPI } from "../services/api";

const Bestellungen = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [backupOrder, setBackupOrder] = useState(null);
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, itemId: null });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    const fetchData = async () => {
      try {
        if (id) {
          // Fetch single order
          const response = await ordersAPI.getById(id);
          if (response.data.success) {
            setSelectedOrder(response.data.data);
          }
        } else {
          // Fetch all orders
          const response = await ordersAPI.getAll();
          if (response.data.success) {
            setOrders(response.data.data);
          }
        }
      } catch (error) {
        console.error("Failed to fetch data:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id]);

  const formatCurrency = (value) => {
    return value?.toFixed(2).replace('.', ',') || '0,00';
  };

  const formatDate = (date) => {
    if (!date) return "-";
    return new Date(date).toLocaleDateString('de-DE');
  };

  const getStatusInfo = (order) => {
    if (order.state === "pending") return { status: "Ausstehend", color: "text-red-500 bg-red-50 border-red-200" };
    if (order.state === "paid") return { status: "Bezahlt", color: "text-green-500 bg-green-50 border-green-200" };
    if (order.state === "completed") return { status: "Abgeschlossen", color: "text-blue-500 bg-blue-50 border-blue-200" };
    return { status: order.state, color: "text-gray-500 bg-gray-50 border-gray-200" };
  };

  // Filter orders by search term
  const filteredOrders = orders.filter(order =>
    order.posReference?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    order.customerId?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    order.customerId?.ref?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Open delete confirmation modal
  const handleOpenDeleteModal = (itemId) => {
    setDeleteModal({ isOpen: true, itemId });
  };

  // Close delete confirmation modal
  const handleCloseDeleteModal = () => {
    setDeleteModal({ isOpen: false, itemId: null });
  };

  // Confirm delete
  const handleConfirmDelete = async () => {
    if (deleteModal.itemId && selectedOrder) {
      try {
        await ordersAPI.deleteItem(selectedOrder._id, deleteModal.itemId);
        setSelectedOrder((prev) => ({
          ...prev,
          items: prev.items.filter((item) => item.orderLineId !== deleteModal.itemId),
        }));
      } catch (error) {
        console.error("Failed to delete item:", error);
      }
    }
    handleCloseDeleteModal();
  };

  // Toggle rabatt checkbox
  const handleToggleRabatt = (itemId) => {
    setSelectedOrder((prev) => ({
      ...prev,
      items: prev.items.map((item) =>
        item.orderLineId === itemId
          ? { ...item, discountEligible: !item.discountEligible }
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
  const handleSave = async () => {
    setSaving(true);
    try {
      for (const item of selectedOrder.items) {
        await ordersAPI.updateItem(selectedOrder._id, item.orderLineId, {
          discountEligible: item.discountEligible
        });
      }
      setBackupOrder(null);
      setIsEditMode(false);
    } catch (error) {
      console.error("Failed to save changes:", error);
    } finally {
      setSaving(false);
    }
  };

  // Cancel changes
  const handleCancel = () => {
    if (backupOrder) {
      setSelectedOrder(backupOrder);
    }
    setBackupOrder(null);
    setIsEditMode(false);
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-12">
          <svg className="animate-spin h-8 w-8 text-gray-400" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        </div>
      </Layout>
    );
  }

  // Orders List View (when no ID)
  if (!id) {
    return (
      <Layout>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Bestellungen</h1>
            <p className="text-gray-500 mt-1">Alle Bestellungen verwalten</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative">
              <input
                type="text"
                placeholder="Suchen..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-64 pl-4 pr-10 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-200 text-sm"
              />
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
          {filteredOrders.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              Keine Bestellungen gefunden
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-6 py-4 text-sm font-semibold text-gray-900">
                    Bestellnummer
                  </th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-gray-900">
                    Kunde
                  </th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-gray-900">
                    Datum
                  </th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-gray-900">
                    Betrag
                  </th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-gray-900">
                    Status
                  </th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-gray-900">
                    Aktion
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((order) => {
                  const statusInfo = getStatusInfo(order);
                  return (
                    <tr
                      key={order._id}
                      className="border-b border-gray-50 hover:bg-gray-50"
                    >
                      <td className="px-6 py-4">
                        <span className="font-medium text-gray-900">
                          {order.posReference}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {order.customerId?.name || "Unbekannt"}
                          </div>
                          <div className="text-sm text-gray-500">
                            {order.customerId?.ref || "-"}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {formatDate(order.orderDate)}
                      </td>
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">
                        € {formatCurrency(order.amountTotal)}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-3 py-1 text-xs font-medium rounded-full border ${statusInfo.color}`}>
                          {statusInfo.status}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => navigate(`/bestellungen/${order._id}`)}
                          className="text-sm text-gray-500 hover:text-gray-900 hover:underline"
                        >
                          Details
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </Layout>
    );
  }

  // Order Detail View (when ID is provided)
  if (!selectedOrder) {
    return (
      <Layout>
        <div className="text-center py-12">
          <p className="text-gray-500">Bestellung nicht gefunden</p>
          <button
            onClick={() => navigate("/bestellungen")}
            className="mt-4 px-6 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
          >
            Zurück zur Liste
          </button>
        </div>
      </Layout>
    );
  }

  // Calculate values from order data
  const customer = selectedOrder.customerId || {};
  const discountEligibleItems = selectedOrder.items?.filter(item => item.discountEligible) || [];
  const discountEligibleAmount = discountEligibleItems.reduce(
    (sum, item) => sum + (item.priceSubtotalIncl * item.quantity), 0
  );
  const discountValue = discountEligibleAmount * 0.1;

  return (
    <Layout>
      {/* Header with Order Number and Back Button */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <span className="text-gray-600 font-medium">Bestellnummer:</span>
          <span className="bg-gray-100 px-4 py-2 rounded-lg font-semibold text-gray-900">
            {selectedOrder.posReference}
          </span>
        </div>
        <button
          onClick={() => navigate("/bestellungen")}
          className="px-6 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
        >
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
              <span className="text-gray-900">{customer.ref || `KUNDE-${customer.contactId}`}</span>
            </div>
            <div className="flex">
              <span className="text-gray-500 w-36">Kundenname:</span>
              <span className="text-gray-900">{customer.name || "-"}</span>
            </div>
            <div className="flex">
              <span className="text-gray-500 w-36">E-Mail:</span>
              <span className="text-gray-900">{customer.email || "-"}</span>
            </div>
            <div className="flex">
              <span className="text-gray-500 w-36">Telefonnummer:</span>
              <span className="text-gray-900">{customer.phone || customer.mobile || "-"}</span>
            </div>
            <div className="flex">
              <span className="text-gray-500 w-36">Adresse:</span>
              <div className="text-gray-900">
                <div>{customer.address?.street || "-"}</div>
                <div>{customer.address?.postalCode} {customer.address?.city}</div>
                <div>{customer.address?.country}</div>
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
              {formatDate(selectedOrder.orderDate)}
            </p>
          </div>

          {/* Discount Value */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 flex flex-col items-center justify-center">
            <h3 className="font-semibold text-gray-900 mb-4">Rabattwert</h3>
            <p className="text-3xl font-bold text-gray-900">
              € {formatCurrency(discountValue)}
            </p>
          </div>

          {/* Total Order Value */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 flex flex-col items-center justify-center">
            <h3 className="font-semibold text-gray-900 mb-4">Gesamtbestellwert</h3>
            <p className="text-3xl font-bold text-gray-900">
              € {formatCurrency(selectedOrder.amountTotal)}
            </p>
          </div>

          {/* Total Without Sales Items */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 flex flex-col items-center justify-center">
            <h3 className="font-semibold text-gray-900 mb-4">Gesamtbestellwert Ohne Verkaufsartikel</h3>
            <p className="text-3xl font-bold text-gray-900">
              € {formatCurrency(discountEligibleAmount)}
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
                disabled={saving}
                className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors text-sm disabled:opacity-50"
              >
                {saving ? "Speichern..." : "Speichern"}
              </button>
              <button
                onClick={handleCancel}
                disabled={saving}
                className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors text-sm disabled:opacity-50"
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
          {(selectedOrder.items || []).map((item) => (
            <div key={item.orderLineId} className="flex gap-4 p-4 border border-gray-200 rounded-xl">
              <img
                src={item.image || "https://via.placeholder.com/150"}
                alt={item.productName}
                className="w-24 h-24 object-cover rounded-lg"
              />
              <div className="flex-1">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-semibold text-gray-900">{item.productName}</h4>
                    <div className="flex items-center gap-2 mt-1">
                      {item.discount > 0 ? (
                        <>
                          <span className="text-red-500 font-semibold">€ {formatCurrency(item.priceSubtotalIncl)}</span>
                          <span className="text-gray-400 line-through text-sm">€ {formatCurrency(item.priceUnit)}</span>
                        </>
                      ) : (
                        <span className="text-gray-900">€ {formatCurrency(item.priceSubtotalIncl)}</span>
                      )}
                    </div>
                  </div>
                  {isEditMode ? (
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={item.discountEligible}
                          onChange={() => handleToggleRabatt(item.orderLineId)}
                          className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                        />
                        <span className="text-sm text-gray-700">Rabatt</span>
                      </label>
                      <button
                        onClick={() => handleOpenDeleteModal(item.orderLineId)}
                        className="p-1.5 text-red-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  ) : (
                    item.discountEligible && (
                      <span className="text-green-600 text-sm font-medium">Rabattberechtigt</span>
                    )
                  )}
                </div>
                <p className="text-sm text-gray-600 mt-2">
                  Farbe: {item.color || "-"} | Material: {item.material || "-"}
                </p>
                <p className="text-sm text-gray-600">
                  Artikelnummer: {item.productId || "-"}
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
