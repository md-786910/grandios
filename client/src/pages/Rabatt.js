import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import { discountsAPI } from "../services/api";

const Rabatt = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [customersData, setCustomersData] = useState([]);
  const [stats, setStats] = useState({
    totalCustomers: 0,
    totalOrderValue: 0,
    totalDiscountGranted: 0,
    totalInQueue: 0,
    customersReadyForDiscount: 0,
    discountRate: 10,
    ordersRequiredForDiscount: 3
  });
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [itemsPerPage] = useState(10);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1); // Reset to page 1 on search
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const fetchDiscounts = useCallback(async () => {
    try {
      setLoading(true);
      const response = await discountsAPI.getAll(currentPage, itemsPerPage, debouncedSearch);
      if (response.data.success) {
        setCustomersData(response.data.data);
        setTotalItems(response.data.total || 0);
        setStats(response.data.stats || {
          totalCustomers: response.data.total || 0,
          totalOrderValue: 0,
          totalDiscountGranted: 0,
          totalInQueue: 0,
          customersReadyForDiscount: 0,
          discountRate: 10,
          ordersRequiredForDiscount: 3
        });
      }
    } catch (error) {
      console.error("Failed to fetch discounts:", error);
    } finally {
      setLoading(false);
    }
  }, [currentPage, itemsPerPage, debouncedSearch]);

  useEffect(() => {
    fetchDiscounts();
  }, [fetchDiscounts]);

  // Pagination calculations
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, totalItems);

  const formatCurrency = (value) => {
    return (value || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const handleViewCustomer = (customerId) => {
    navigate(`/rabatt/${customerId}`);
  };

  return (
    <Layout>
      {/* Search and Filter */}
      <div className="flex items-center justify-between mb-6">
        <div className="relative">
          <input
            type="text"
            placeholder="Suchen..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-64 pl-4 pr-10 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-200 text-sm"
          />
          <button className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </button>
        </div>
        <button className="px-6 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors text-sm">
          Filter
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {/* Gesamtzahl der Kunden */}
        <div className="bg-green-50 rounded-xl border border-green-100 p-6">
          <h3 className="text-center font-semibold text-green-600 mb-2">Gesamtzahl der Kunden</h3>
          <p className="text-center text-3xl font-bold text-gray-900">{stats.totalCustomers?.toLocaleString('de-DE') || 0}</p>
        </div>

        {/* Gesamtbestellwert */}
        <div className="bg-red-50 rounded-xl border border-red-100 p-6">
          <h3 className="text-center font-semibold text-red-500 mb-2">Gesamtbestellwert</h3>
          <p className="text-center text-3xl font-bold text-gray-900">€ {formatCurrency(stats.totalOrderValue)}</p>
        </div>

        {/* Gesamter Gewährter Rabatt */}
        <div className="bg-rose-50 rounded-xl border border-rose-100 p-6">
          <h3 className="text-center font-semibold text-gray-700 mb-2">Gesamter Gewährter Rabatt</h3>
          <p className="text-center text-3xl font-bold text-gray-900">€ {formatCurrency(stats.totalDiscountGranted)}</p>
        </div>
      </div>

      {/* Queue Stats Info Bar */}
      {(stats.totalInQueue > 0 || stats.customersReadyForDiscount > 0) && (
        <div className="bg-blue-50 rounded-xl border border-blue-100 p-4 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <svg className="h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                <span className="text-sm text-blue-800">
                  <strong>{stats.totalInQueue}</strong> Bestellungen in Warteschlange
                </span>
              </div>
              {stats.customersReadyForDiscount > 0 && (
                <div className="flex items-center gap-2 pl-4 border-l border-blue-200">
                  <span className="text-sm text-blue-800">
                    <strong>{stats.customersReadyForDiscount}</strong> Kunden bereit für Rabatt
                  </span>
                </div>
              )}
            </div>
            <div className="text-xs text-blue-600">
              {stats.ordersRequiredForDiscount} Bestellungen = {stats.discountRate}% Rabatt
            </div>
          </div>
        </div>
      )}

      {/* Customers List */}
      <div className="bg-white rounded-xl border border-gray-200">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <svg className="animate-spin h-8 w-8 text-gray-400" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
        ) : customersData.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            Keine Kunden gefunden
          </div>
        ) : (
          customersData.map((discount, index) => (
            <div
              key={discount.id || discount._id}
              className={`flex items-center justify-between p-4 ${
                index !== customersData.length - 1 ? "border-b border-gray-100" : ""
              }`}
            >
              {/* Customer Info */}
              <div className="min-w-[250px]">
                <h4 className="font-semibold text-gray-900">{discount.customerName || "Unbekannt"}</h4>
                <p className="text-sm text-gray-600">
                  <span className="font-medium">Kundennummer:</span> {discount.customerNumber || "-"}
                </p>
                <p className="text-sm text-gray-600">
                  <span className="font-medium">E-Mail:</span> {discount.email || "-"}
                </p>
              </div>

              {/* Order Values */}
              <div className="min-w-[200px]">
                <p className="text-sm text-gray-600">
                  <span className="font-medium">Gesamtbestellwert:</span> € {formatCurrency(discount.totalOrderValue)}
                </p>
                <p className="text-sm text-gray-600">
                  <span className="font-medium">Gesamtrabatt Gewährt:</span> € {formatCurrency(discount.totalDiscountGranted)}
                </p>
              </div>

              {/* Rabattpreis & Queue Status */}
              <div className="min-w-[150px]">
                <p className="text-sm text-gray-600">
                  <span className="font-medium">Rabattpreis:</span> € {formatCurrency(discount.discountBalance)}
                </p>
                {/* Queue indicator */}
                {discount.queueCount > 0 && (
                  <p className="text-sm text-blue-600 mt-1">
                    <span className="font-medium">Warteschlange:</span> {discount.queueCount}/{discount.ordersRequiredForDiscount || 3}
                  </p>
                )}
              </div>

              {/* Action Button */}
              <div className="flex flex-col items-end gap-1">
                <button
                  onClick={() => handleViewCustomer(discount.id || discount.customerId)}
                  className="px-6 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors text-sm"
                >
                  Sicht
                </button>
                {/* Status indicators */}
                {discount.readyForDiscount && (
                  <span className="text-blue-500 text-sm font-medium">Bereit für Rabatt</span>
                )}
                {discount.redeemable && (
                  <span className="text-green-500 text-sm">Einlösbar</span>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between mt-4 px-2">
        <div className="text-sm text-gray-500">
          Zeige {totalItems > 0 ? startIndex + 1 : 0}-{endIndex} von {totalItems} Kunden
        </div>
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                currentPage === 1
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Zurück
            </button>
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                let pageNum;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }
                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                      currentPage === pageNum
                        ? 'bg-gray-900 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                currentPage === totalPages
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Weiter
            </button>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Rabatt;
