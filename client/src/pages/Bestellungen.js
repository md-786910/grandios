import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import ConfirmModal from "../components/ConfirmModal";
import { ordersAPI, testAPI, customersAPI } from "../services/api";
import { sanitizeName } from "../utils/helpers";

const Bestellungen = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [backupOrder, setBackupOrder] = useState(null);
  const [deleteModal, setDeleteModal] = useState({
    isOpen: false,
    itemId: null,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [generatingData, setGeneratingData] = useState(false);
  const [testMessage, setTestMessage] = useState({ type: "", text: "" });
  const [showTestMenu, setShowTestMenu] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState("");
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [customerPage, setCustomerPage] = useState(1);
  const [hasMoreCustomers, setHasMoreCustomers] = useState(true);
  const [totalCustomers, setTotalCustomers] = useState(0);
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
  const customerDropdownRef = useRef(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [statusFilter, setStatusFilter] = useState("");

  const fetchOrders = async () => {
    try {
      // Fetch all orders (high limit to get everything for client-side pagination)
      const response = await ordersAPI.getAll(1, 1000);
      if (response.data.success) {
        setOrders(response.data.data);
      }
    } catch (error) {
      console.error("Failed to fetch orders:", error);
    }
  };

  const fetchCustomers = useCallback(async (page = 1, reset = false) => {
    if (loadingCustomers) return;

    try {
      setLoadingCustomers(true);
      const limit = 20;

      const response = await customersAPI.getAll(page, limit);
      if (response.data.success) {
        const newCustomers = response.data.data;
        const total = response.data.total || 0;
        const totalPages = response.data.pagination?.pages || 1;

        if (reset) {
          setCustomers(newCustomers);
        } else {
          setCustomers(prev => [...prev, ...newCustomers]);
        }

        setTotalCustomers(total);
        setCustomerPage(page);
        setHasMoreCustomers(page < totalPages);
      }
    } catch (error) {
      console.error("Failed to fetch customers:", error);
    } finally {
      setLoadingCustomers(false);
    }
  }, [loadingCustomers]);

  // Handle scroll in customer dropdown to load more
  const handleCustomerScroll = useCallback((e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target;
    // Load more when scrolled near bottom (within 50px)
    if (scrollHeight - scrollTop - clientHeight < 50 && hasMoreCustomers && !loadingCustomers) {
      fetchCustomers(customerPage + 1);
    }
  }, [customerPage, hasMoreCustomers, loadingCustomers, fetchCustomers]);

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
          // Fetch orders first, then load customers in background
          await fetchOrders();
          // Start loading first page of customers in background
          fetchCustomers(1, true);
        }
      } catch (error) {
        console.error("Failed to fetch data:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Generate test orders for selected customer
  const handleGenerateOrdersForCustomer = async () => {
    if (!selectedCustomer) {
      setTestMessage({
        type: "error",
        text: "Bitte wählen Sie einen Kunden aus",
      });
      return;
    }
    setGeneratingData(true);
    setTestMessage({ type: "", text: "" });
    try {
      const response = await testAPI.generateOrders(selectedCustomer, 3);
      if (response.data.success) {
        setTestMessage({ type: "success", text: response.data.message });
        await fetchOrders();
        setSelectedCustomer("");
      }
    } catch (error) {
      setTestMessage({
        type: "error",
        text: error.message || "Fehler beim Erstellen der Testdaten",
      });
    } finally {
      setGeneratingData(false);
      setShowTestMenu(false);
    }
  };

  // Generate complete test data (customers + orders)
  const handleGenerateCompleteData = async () => {
    setGeneratingData(true);
    setTestMessage({ type: "", text: "" });
    try {
      const response = await testAPI.generateCompleteData(3, 4);
      if (response.data.success) {
        setTestMessage({ type: "success", text: response.data.message });
        await Promise.all([fetchOrders(), fetchCustomers(1, true)]);
      }
    } catch (error) {
      setTestMessage({
        type: "error",
        text: error.message || "Fehler beim Erstellen der Testdaten",
      });
    } finally {
      setGeneratingData(false);
      setShowTestMenu(false);
    }
  };

  // Clear all test data
  const handleClearTestData = async () => {
    setGeneratingData(true);
    setTestMessage({ type: "", text: "" });
    try {
      const response = await testAPI.clearTestData();
      if (response.data.success) {
        setTestMessage({ type: "success", text: response.data.message });
        await Promise.all([fetchOrders(), fetchCustomers(1, true)]);
      }
    } catch (error) {
      setTestMessage({
        type: "error",
        text: error.message || "Fehler beim Löschen der Testdaten",
      });
    } finally {
      setGeneratingData(false);
      setShowTestMenu(false);
    }
  };

  const formatCurrency = (value) => {
    return (value || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const formatDate = (date) => {
    if (!date) return "-";
    return new Date(date).toLocaleDateString("de-DE");
  };

  const getStatusInfo = (order) => {
    // Show discount group status if order is in a discount group
    if (order.discountStatus === "available") {
      return {
        status: "Ausstehend",
        color: "text-yellow-600 bg-yellow-50 border-yellow-200",
      };
    }
    if (order.discountStatus === "redeemed") {
      return {
        status: "Eingelöst",
        color: "text-green-600 bg-green-50 border-green-200",
      };
    }
    // No discount group - show dash
    return { status: "-", color: "text-gray-400 bg-gray-50 border-gray-200" };
  };

  // Filter orders by search term, status and sort by date (recent first)
  const filteredOrders = orders
    .filter((order) => {
      // Search filter (order number, customer name, customer ref)
      const matchesSearch =
        !searchTerm ||
        order.posReference?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        sanitizeName(order.customerId?.name)
          .toLowerCase()
          .includes(searchTerm.toLowerCase()) ||
        order.customerId?.ref?.toLowerCase().includes(searchTerm.toLowerCase());

      // Status filter - use discountStatus instead of payment state
      const matchesStatus =
        !statusFilter || order.discountStatus === statusFilter;

      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => new Date(b.orderDate) - new Date(a.orderDate));

  // Pagination calculations
  const totalPages = Math.ceil(filteredOrders.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedOrders = filteredOrders.slice(startIndex, endIndex);

  // Reset to page 1 when search or filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter]);

  const handlePrevPage = () => {
    setCurrentPage((prev) => Math.max(prev - 1, 1));
  };

  const handleNextPage = () => {
    setCurrentPage((prev) => Math.min(prev + 1, totalPages));
  };

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
          items: prev.items.filter(
            (item) => item.orderLineId !== deleteModal.itemId
          ),
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
          discountEligible: item.discountEligible,
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
          <svg
            className="animate-spin h-8 w-8 text-gray-400"
            viewBox="0 0 24 24"
          >
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
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        </div>
      </Layout>
    );
  }

  // Orders List View (when no ID)
  if (!id) {
    return (
      <Layout>
        {/* Test Message */}
        {testMessage.text && (
          <div
            className={`mb-4 p-4 rounded-lg ${
              testMessage.type === "success"
                ? "bg-green-50 border border-green-200 text-green-700"
                : "bg-red-50 border border-red-200 text-red-700"
            }`}
          >
            {testMessage.text}
          </div>
        )}

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Bestellungen</h1>
            <p className="text-gray-500 mt-1">
              {orders.length} Bestellungen insgesamt
              {(searchTerm || statusFilter) &&
                ` • ${filteredOrders.length} gefiltert`}
            </p>
          </div>
          <div className="flex items-center gap-4">
            {/* Search Input */}
            <div className="relative">
              <input
                type="text"
                placeholder="Bestellnr., Kunde suchen..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-64 pl-4 pr-10 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-200 text-sm"
              />
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-200 text-sm bg-white"
            >
              <option value="">Alle Status</option>
              <option value="available">Ausstehend</option>
              <option value="redeemed">Eingelöst</option>
            </select>

            {/* Test Data Button with Dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowTestMenu(!showTestMenu)}
                disabled={generatingData}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm disabled:opacity-50 flex items-center gap-2"
              >
                {generatingData ? (
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
                ) : (
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
                    />
                  </svg>
                )}
                Testdaten
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>

              {showTestMenu && (
                <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                  <div className="p-4 border-b border-gray-100">
                    <h4 className="font-semibold text-gray-900 mb-2">
                      Testbestellungen erstellen
                    </h4>
                    <div className="space-y-2">
                      {/* Custom scrollable customer dropdown */}
                      <div className="relative">
                        <div
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white cursor-pointer flex items-center justify-between"
                          onClick={() => setCustomerDropdownOpen(!customerDropdownOpen)}
                        >
                          <span className={selectedCustomer ? "text-gray-900" : "text-gray-500"}>
                            {selectedCustomer
                              ? customers.find(c => c._id === selectedCustomer)?.name || "Kunde auswählen..."
                              : "Kunde auswählen..."}
                          </span>
                          <svg className={`h-4 w-4 text-gray-400 transition-transform ${customerDropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                        {customerDropdownOpen && (
                          <div
                            ref={customerDropdownRef}
                            onScroll={handleCustomerScroll}
                            className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto"
                          >
                            {customers.map((customer) => (
                              <div
                                key={customer._id}
                                className={`px-3 py-2 text-sm cursor-pointer hover:bg-purple-50 ${selectedCustomer === customer._id ? 'bg-purple-100' : ''}`}
                                onClick={() => {
                                  setSelectedCustomer(customer._id);
                                  setCustomerDropdownOpen(false);
                                }}
                              >
                                {sanitizeName(customer.name)} ({customer.ref || customer._id.slice(-6)})
                              </div>
                            ))}
                            {loadingCustomers && (
                              <div className="px-3 py-2 text-sm text-gray-500 flex items-center gap-2">
                                <svg className="animate-spin h-4 w-4 text-purple-600" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                                Laden...
                              </div>
                            )}
                            {!loadingCustomers && hasMoreCustomers && (
                              <div className="px-3 py-2 text-xs text-gray-400 text-center">
                                Scrollen für mehr...
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      <p className="text-xs text-gray-500">
                        {customers.length} von {totalCustomers} Kunden geladen
                      </p>
                      <button
                        onClick={handleGenerateOrdersForCustomer}
                        disabled={!selectedCustomer || generatingData}
                        className="w-full px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm disabled:opacity-50"
                      >
                        3 Bestellungen erstellen
                      </button>
                    </div>
                  </div>
                  <div className="p-4 space-y-2">
                    <button
                      onClick={handleGenerateCompleteData}
                      disabled={generatingData}
                      className="w-full px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm disabled:opacity-50"
                    >
                      Komplette Testdaten erstellen (3 Kunden + Bestellungen)
                    </button>
                    <button
                      onClick={handleClearTestData}
                      disabled={generatingData}
                      className="w-full px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm disabled:opacity-50"
                    >
                      Alle Testdaten löschen
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
          {filteredOrders.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              Keine Bestellungen gefunden
            </div>
          ) : (
            <>
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
                  {paginatedOrders.map((order) => {
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
                              {sanitizeName(order.customerId?.name)}
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
                          <span
                            className={`px-3 py-1 text-xs font-medium rounded-full border ${statusInfo.color}`}
                          >
                            {statusInfo.status}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <button
                            onClick={() =>
                              navigate(`/bestellungen/${order._id}`)
                            }
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

              {/* Pagination Controls - Always show */}
              <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
                <p className="text-sm text-gray-600">
                  Zeige {filteredOrders.length > 0 ? startIndex + 1 : 0}-
                  {Math.min(endIndex, filteredOrders.length)} von{" "}
                  {filteredOrders.length} Bestellungen
                </p>
                {totalPages > 1 && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handlePrevPage}
                      disabled={currentPage === 1}
                      className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Zurück
                    </button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter(page => {
                        if (totalPages <= 7) return true;
                        if (page === 1 || page === totalPages) return true;
                        if (Math.abs(page - currentPage) <= 1) return true;
                        return false;
                      })
                      .map((page, index, array) => (
                        <React.Fragment key={page}>
                          {index > 0 && array[index - 1] !== page - 1 && (
                            <span className="px-2 text-gray-400">...</span>
                          )}
                          <button
                            onClick={() => setCurrentPage(page)}
                            className={`px-4 py-2 text-sm font-medium rounded-lg ${
                              currentPage === page
                                ? "bg-blue-500 text-white"
                                : "text-gray-700 bg-white border border-gray-300 hover:bg-gray-50"
                            }`}
                          >
                            {page}
                          </button>
                        </React.Fragment>
                      ))}
                    <button
                      onClick={handleNextPage}
                      disabled={currentPage === totalPages}
                      className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Weiter
                    </button>
                  </div>
                )}
              </div>
            </>
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
  // Use orderLines (from WAWI sync) or items (legacy) - merge both sources
  const customer = selectedOrder.customerId || {};
  const orderItems =
    selectedOrder.orderLines?.length > 0
      ? selectedOrder.orderLines.map((line) => ({
          orderLineId: line.orderLineId || line._id,
          productId: line.productId,
          productName: line.fullProductName || line.productName,
          priceUnit: line.priceUnit,
          priceSubtotalIncl:
            line.priceSubtotalIncl || line.priceUnit * line.quantity,
          quantity: line.quantity || 1,
          discount: line.discount || 0,
          discountEligible: line.discountEligible !== false,
          image: line.productRef?.image || null,
          color:
            line.productRef?.attributeValues?.find(
              (a) => a.attributeName === "Farbe"
            )?.valueName || null,
          material:
            line.productRef?.attributeValues?.find(
              (a) => a.attributeName === "Material"
            )?.valueName || null,
        }))
      : selectedOrder.items || [];

  const discountEligibleItems = orderItems.filter(
    (item) => item.discountEligible
  );
  const discountEligibleAmount = discountEligibleItems.reduce(
    (sum, item) =>
      sum + (item.priceSubtotalIncl || item.priceUnit) * (item.quantity || 1),
    0
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
          <h3 className="text-center font-semibold text-gray-900 mb-6">
            Kundendetails
          </h3>
          <div className="space-y-3 text-sm">
            <div className="flex">
              <span className="text-gray-500 w-36">Kundennummer:</span>
              <span className="text-gray-900">
                {customer.ref || `KUNDE-${customer.contactId}`}
              </span>
            </div>
            <div className="flex">
              <span className="text-gray-500 w-36">Kundenname:</span>
              <span className="text-gray-900">{sanitizeName(customer.name)}</span>
            </div>
            <div className="flex">
              <span className="text-gray-500 w-36">E-Mail:</span>
              <span className="text-gray-900">{customer.email || "-"}</span>
            </div>
            <div className="flex">
              <span className="text-gray-500 w-36">Telefonnummer:</span>
              <span className="text-gray-900">
                {customer.phone || customer.mobile || "-"}
              </span>
            </div>
            <div className="flex">
              <span className="text-gray-500 w-36">Adresse:</span>
              <div className="text-gray-900">
                <div>{customer.address?.street || "-"}</div>
                <div>
                  {customer.address?.postalCode} {customer.address?.city}
                </div>
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
            <h3 className="font-semibold text-gray-900 mb-4">
              Gesamtbestellwert
            </h3>
            <p className="text-3xl font-bold text-gray-900">
              € {formatCurrency(selectedOrder.amountTotal)}
            </p>
          </div>

          {/* Total Without Sales Items */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 flex flex-col items-center justify-center">
            <h3 className="font-semibold text-gray-900 mb-4">
              Gesamtbestellwert Ohne Verkaufsartikel
            </h3>
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
          {/* Hide edit button if order is redeemed */}
          {selectedOrder.discountStatus !== "redeemed" &&
            (isEditMode ? (
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
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5 text-gray-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                  />
                </svg>
              </button>
            ))}
        </div>

        <div className="grid grid-cols-2 gap-4">
          {orderItems.map((item) => (
            <div
              key={item.orderLineId}
              className="flex gap-4 p-4 border border-gray-200 rounded-xl"
            >
              <img
                src={item.image || "https://11316b7a2b.wawi.onretail.eu/web/image/product.template/472/image_256"}
                alt={item.productName}
                className="w-24 h-24 object-cover rounded-lg"
                onError={(e) => { e.target.src = "https://11316b7a2b.wawi.onretail.eu/web/image/product.template/472/image_256"; }}
              />
              <div className="flex-1">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-semibold text-gray-900">
                      {item.productName}
                    </h4>
                    <div className="flex items-center gap-2 mt-1">
                      {item.discount > 0 ? (
                        <>
                          <span className="text-red-500 font-semibold">
                            € {formatCurrency(item.priceSubtotalIncl)}
                          </span>
                          <span className="text-gray-400 line-through text-sm">
                            € {formatCurrency(item.priceUnit)}
                          </span>
                        </>
                      ) : (
                        <span className="text-gray-900">
                          € {formatCurrency(item.priceSubtotalIncl)}
                        </span>
                      )}
                    </div>
                  </div>
                  {selectedOrder.discountStatus === "redeemed" ? (
                    // Show "Rabatt angewendet" in gray for redeemed orders
                    item.discountEligible && (
                      <span className="text-gray-400 text-sm font-medium">
                        Rabatt angewendet
                      </span>
                    )
                  ) : isEditMode ? (
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
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-5 w-5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </button>
                    </div>
                  ) : (
                    item.discountEligible && (
                      <span className="text-green-600 text-sm font-medium">
                        Rabattberechtigt
                      </span>
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
