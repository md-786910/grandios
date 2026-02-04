import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import Layout from "../components/Layout";
import { discountsAPI } from "../services/api";
import { sanitizeName } from "../utils/helpers";

const Bonus = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

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
    ordersRequiredForDiscount: 3,
  });
  const [loading, setLoading] = useState(true);

  // URL-based state
  const currentPage = parseInt(searchParams.get("page") || "1", 10);
  const statusFilter = searchParams.get("status") || "";

  const [totalItems, setTotalItems] = useState(0);
  const [itemsPerPage] = useState(10);

  // Helper to update URL params
  const updateParams = (updates) => {
    setSearchParams((prev) => {
      const newParams = new URLSearchParams(prev);
      Object.entries(updates).forEach(([key, value]) => {
        if (value === null || value === undefined || value === "") {
          newParams.delete(key);
        } else {
          newParams.set(key, String(value));
        }
      });
      return newParams;
    });
  };

  // Debounce search term
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      if (searchTerm && currentPage !== 1) {
        updateParams({ page: 1 });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const fetchDiscounts = useCallback(async () => {
    try {
      setLoading(true);
      const response = await discountsAPI.getAll(
        currentPage,
        itemsPerPage,
        debouncedSearch
      );
      if (response.data.success) {
        setCustomersData(response.data.data);
        setTotalItems(response.data.total || 0);
        setStats(
          response.data.stats || {
            totalCustomers: response.data.total || 0,
            totalOrderValue: 0,
            totalDiscountGranted: 0,
            totalInQueue: 0,
            customersReadyForDiscount: 0,
            discountRate: 10,
            ordersRequiredForDiscount: 3,
          }
        );
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

  // Filter customers based on status filter
  const filteredCustomers = customersData.filter((discount) => {
    if (!statusFilter) return true;
    if (statusFilter === "redeemable") return discount.redeemable;
    if (statusFilter === "ready") return discount.readyForDiscount;
    if (statusFilter === "inQueue") return discount.queueCount > 0;
    return true;
  });

  // Pagination calculations
  const filteredTotal = statusFilter ? filteredCustomers.length : totalItems;
  const totalPages = Math.ceil(filteredTotal / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, filteredTotal);
  const paginatedCustomers = statusFilter
    ? filteredCustomers.slice(startIndex, endIndex)
    : customersData;

  const formatCurrency = (value) => {
    return (value || 0).toLocaleString("de-DE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const handleViewCustomer = (customerId, customerName) => {
    navigate(`/bonus/${customerId}`, { state: { customerName } });
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
          {searchTerm ? (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5 absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 cursor-pointer hover:text-gray-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              onClick={() => setSearchTerm("")}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          ) : (
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
          )}
        </div>
        <select
          value={statusFilter}
          onChange={(e) => updateParams({ status: e.target.value, page: 1 })}
          className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-200 text-sm bg-white"
        >
          <option value="">Alle Status</option>
          <option value="redeemable">Einlösbar</option>
          <option value="ready">Bereit für Bonus</option>
          <option value="inQueue">In Warteschlange</option>
        </select>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {/* Gesamtzahl der Kunden */}
        <div className="bg-purple-50 rounded-xl border border-purple-100 p-6">
          <h3 className="text-center font-bold text-purple-600 mb-2">
            Gesamtzahl der Kunden
          </h3>
          <p className="text-center text-3xl font-bold text-gray-900">
            {formatCurrency(stats.totalCustomers + 1000)}
          </p>
        </div>

        {/* Gesamtbestellwert */}
        <div className="bg-green-50 rounded-xl border border-green-100 p-6">
          <h3 className="text-center font-bold text-green-600 mb-2">
            Gesamtbestellwert
          </h3>
          <p className="text-center text-3xl font-bold text-gray-900">
            € {formatCurrency(stats.totalOrderValue)}
          </p>
        </div>

        {/* Gesamter gewährter Bonus */}
        <div className="bg-blue-50 rounded-xl border border-blue-100 p-6">
          <h3 className="text-center font-bold text-blue-600 mb-2">
            Gesamter gewährter Bonus
          </h3>
          <p className="text-center text-3xl font-bold text-gray-900">
            € {formatCurrency(stats.totalDiscountGranted)}
          </p>
        </div>
      </div>

      {/* Queue Stats Info Bar */}
      {(stats.totalInQueue > 0 || stats.customersReadyForDiscount > 0) && (
        <div className="bg-blue-50 rounded-xl border border-blue-100 p-4 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <svg
                  className="h-5 w-5 text-blue-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                  />
                </svg>
                <span className="text-sm text-blue-800">
                  <strong>{stats.totalInQueue}</strong> Einkäufe in
                  Warteschlange
                </span>
              </div>
              {stats.customersReadyForDiscount > 0 && (
                <div className="flex items-center gap-2 pl-4 border-l border-blue-200">
                  <span className="text-sm text-blue-800">
                    <strong>{stats.customersReadyForDiscount}</strong> Kunden
                    bereit für Bonus
                  </span>
                </div>
              )}
            </div>
            <div className="text-xs text-blue-600">
              {stats.ordersRequiredForDiscount} Einkäufe ={" "}
              {stats.discountRate}% Bonus
            </div>
          </div>
        </div>
      )}

      {/* Customers List */}
      <div className="bg-white rounded-xl border border-gray-200">
        {loading ? (
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
        ) : paginatedCustomers.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            Keine Kunden gefunden
          </div>
        ) : (
          paginatedCustomers.map((discount, index) => (
            <div
              key={discount.id || discount._id}
              className={`flex items-center justify-between p-4 ${index !== paginatedCustomers.length - 1
                ? "border-b border-gray-100"
                : ""
                }`}
            >
              {/* Customer Info */}
              <div className="min-w-[250px]">
                <h4 className="font-semibold text-gray-900">
                  {sanitizeName(discount.customerName)}
                </h4>
                <p className="text-sm text-gray-600">
                  <span className="font-medium">Kundennummer:</span>{" "}
                  {discount.customerNumber || "-"}
                </p>
                <p className="text-sm text-gray-600">
                  <span className="font-medium">E-Mail:</span>{" "}
                  {discount.email || "-"}
                </p>
              </div>

              {/* Order Values */}
              <div className="min-w-[200px]">
                <p className="text-sm text-gray-600">
                  <span className="font-medium">Gesamtbestellwert:</span> €{" "}
                  {formatCurrency(discount.totalOrderValue)}
                </p>
                <p className="text-sm text-gray-600">
                  <span className="font-medium">Gesamtbonus Gewährt:</span> €{" "}
                  {formatCurrency(discount.totalDiscountGranted)}
                </p>
              </div>

              {/* Bonuspreis & Queue Status */}
              <div className="min-w-[150px]">
                {(() => {
                  const redeemable = discount.redeemableBonus || 0;
                  const pending = discount.pendingBonus || 0;
                  const displayAmount = redeemable > 0 ? redeemable : pending > 0 ? pending : 0;
                  const colorClass = redeemable > 0
                    ? 'text-green-600'
                    : pending > 0
                      ? 'text-orange-500'
                      : 'text-red-600';

                  return (
                    <div
                      onClick={() => {
                        navigator.clipboard.writeText(`€ ${formatCurrency(displayAmount)}`);
                        toast.success("Betrag kopiert!");
                      }}
                      className="cursor-pointer hover:opacity-80 transition-opacity"
                      title="Klicken zum Kopieren"
                    >
                      <p className="text-sm">
                        <span className="font-medium text-gray-600">Bonuspreis:</span>{" "}
                        <span className={`font-bold ${colorClass}`}>
                          € {formatCurrency(displayAmount)}
                        </span>
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">Klicken zum Kopieren</p>
                    </div>
                  );
                })()}
                {/* Queue indicator */}
                {discount.queueCount > 0 && (
                  <p className="text-sm text-blue-600 mt-1">
                    <span className="font-medium">Warteschlange:</span>{" "}
                    {discount.queueCount}/
                    {discount.ordersRequiredForDiscount || 3}
                  </p>
                )}
              </div>

              {/* Action Button */}
              <div className="flex flex-col items-start gap-1">
                <button
                  onClick={() =>
                    handleViewCustomer(
                      discount.id || discount.customerId,
                      discount.customerName
                    )
                  }
                  className="px-6 py-2 rounded-lg bg-gray-800 text-white hover:bg-gray-900 font-medium tracking-wide transition-all duration-500 ease-in-out hover:-translate-y-[1px] text-sm"
                >
                  Ansehen
                </button>
                {/* Status indicators */}
                {discount.readyForDiscount && (
                  <span className="text-blue-500 text-sm font-medium">
                    Bereit für Bonus
                  </span>
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
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-6">
          <p className="text-sm text-gray-600">
            Zeige {filteredTotal > 0 ? startIndex + 1 : 0}-{endIndex} von{" "}
            {filteredTotal} Kunden
            {statusFilter && ` (gefiltert)`}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => updateParams({ page: Math.max(currentPage - 1, 1) })}
              disabled={currentPage === 1}
              className="px-2 py-1 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Zurück
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((page) => {
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
                    onClick={() => updateParams({ page })}
                    className={`px-3 py-1 text-sm font-medium rounded-lg ${currentPage === page
                      ? "bg-gray-900 text-white"
                      : "text-gray-700 bg-white border border-gray-300 hover:bg-gray-50"
                      }`}
                  >
                    {page}
                  </button>
                </React.Fragment>
              ))}
            <button
              onClick={() =>
                updateParams({ page: Math.min(currentPage + 1, totalPages) })
              }
              disabled={currentPage === totalPages}
              className="px-2 py-1 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Weiter
            </button>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default Bonus;
