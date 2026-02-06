import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import Layout from "../components/Layout";
import { syncAPI } from "../services/api";
import { sanitizeName } from "../utils/helpers";

const Kunden = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // URL-based state
  const currentPage = parseInt(searchParams.get("page") || "1", 10);
  const sortBy = searchParams.get("sort") || "name";
  const sortOrder = searchParams.get("order") || "asc";

  const [itemsPerPage] = useState(20);
  const [pagination, setPagination] = useState({
    total: 0,
    pages: 0,
  });

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

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const response = await syncAPI.getCustomers(
        currentPage,
        itemsPerPage,
        debouncedSearch,
        sortBy,
        sortOrder,
      );
      if (response.data.success) {
        setCustomers(response.data.data);
        setPagination(response.data.pagination);
      }
    } catch (error) {
      console.error("Failed to fetch customers:", error);
    } finally {
      setLoading(false);
    }
  }, [currentPage, itemsPerPage, debouncedSearch, sortBy, sortOrder]);

  // Handle sort change
  const handleSort = (field) => {
    if (sortBy === field) {
      updateParams({ order: sortOrder === "asc" ? "desc" : "asc", page: 1 });
    } else {
      updateParams({ sort: field, order: "asc", page: 1 });
    }
  };

  // Sort indicator component
  const SortIcon = ({ field }) => {
    if (sortBy !== field) {
      return (
        <svg
          className="w-4 h-4 text-gray-300"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
          />
        </svg>
      );
    }
    return sortOrder === "asc" ? (
      <svg
        className="w-4 h-4 text-gray-700"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M5 15l7-7 7 7"
        />
      </svg>
    ) : (
      <svg
        className="w-4 h-4 text-gray-700"
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
    );
  };

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  const formatCurrency = (value) => {
    return (value || 0).toLocaleString("de-DE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const totalPages = pagination.pages;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, pagination.total);

  return (
    <Layout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Kunden</h1>
          <p className="text-gray-500 mt-1">
            {pagination.total > 0
              ? `${pagination.total.toLocaleString("de-DE")} Kunden insgesamt`
              : "Kundenverwaltung"}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative">
            <input
              type="text"
              placeholder="Name, E-Mail, Kundennr. suchen..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full max-w-xs pl-4 pr-10 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-200 text-sm"
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
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
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
        ) : customers.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            Keine Kunden gefunden
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th
                    className="text-left px-6 py-4 text-sm font-semibold text-gray-900 cursor-pointer hover:bg-gray-50"
                    onClick={() => handleSort("name")}
                  >
                    <div className="flex items-center gap-2">
                      Kunde
                      <SortIcon field="name" />
                    </div>
                  </th>
                  <th
                    className="text-left px-6 py-4 text-sm font-semibold text-gray-900 cursor-pointer hover:bg-gray-50"
                    onClick={() => handleSort("customerNumber")}
                  >
                    <div className="flex items-center gap-2">
                      Kundennummer
                      <SortIcon field="customerNumber" />
                    </div>
                  </th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-gray-900">
                    Telefon
                  </th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-gray-900">
                    Stadt
                  </th>
                  {/* <th
                  className="text-left px-6 py-4 text-sm font-semibold text-gray-900 cursor-pointer hover:bg-gray-50"
                  onClick={() => handleSort("wallet")}
                >
                  <div className="flex items-center gap-2">
                    Wallet
                    <SortIcon field="wallet" />
                  </div>
                </th> */}
                  <th className="text-left px-6 py-4 text-sm font-semibold text-gray-900">
                    Bonus Gewährt
                  </th>
                  <th
                    className="text-left px-6 py-4 text-sm font-semibold text-gray-900 cursor-pointer hover:bg-gray-50"
                    onClick={() => handleSort("discountRedeemed")}
                  >
                    <div className="flex items-center gap-2">
                      Bonus Eingelöst
                      <SortIcon field="discountRedeemed" />
                    </div>
                  </th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-gray-900">
                    Aktion
                  </th>
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => (
                  <tr
                    key={customer._id}
                    className="border-b border-gray-50 hover:bg-gray-50"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 font-medium">
                          {sanitizeName(customer.name).charAt(0)}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {sanitizeName(customer.name)}
                          </div>
                          <div className="text-sm text-gray-500">
                            {customer.email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {customer.contactId || "-"}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {customer.phone || customer.mobile || "-"}
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">
                      {customer.address?.city || "-"}
                    </td>
                    <td className="px-6 py-4">
                      {(() => {
                        const redeemable = customer.redeemableBonus || 0;
                        const pending = customer.pendingBonus || 0;
                        const displayAmount =
                          redeemable > 0
                            ? redeemable
                            : pending > 0
                              ? pending
                              : 0;
                        const colorClass =
                          redeemable > 0
                            ? "text-green-600"
                            : pending > 0
                              ? "text-orange-500"
                              : "text-red-600";

                        return (
                          <div
                            onClick={() => {
                              navigator.clipboard.writeText(
                                `€ ${formatCurrency(displayAmount)}`,
                              );
                              toast.success("Betrag kopiert!");
                            }}
                            className="cursor-pointer hover:opacity-80 transition-opacity"
                            title="Klicken zum Kopieren"
                          >
                            <p className="text-sm">
                              <span className={`font-bold ${colorClass}`}>
                                € {formatCurrency(displayAmount)}
                              </span>
                            </p>
                            <p className="text-xs text-gray-400 mt-0.5">
                              Klicken zum Kopieren
                            </p>
                          </div>
                        );
                      })()}
                      {customer.queueCount > 0 && (
                        <p className="text-xs text-blue-600 mt-1">
                          <span className="font-medium">Warteschlange:</span>{" "}
                          {customer.queueCount}/
                          {customer.ordersRequiredForDiscount || 3}
                        </p>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-left text-gray-600">
                      € {formatCurrency(customer.totalDiscountRedeemed || 0)}
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() =>
                          navigate(`/bonus/${customer._id}`, {
                            state: { customerName: customer.name },
                          })
                        }
                        className="px-4 py-3 rounded-lg bg-gray-800 text-white hover:bg-gray-900 font-medium tracking-wide transition-all duration-500 ease-in-out hover:-translate-y-[1px] text-sm"
                      >
                        Anzeigen
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-6">
          <p className="text-sm text-gray-600">
            Zeige {pagination.total > 0 ? startIndex + 1 : 0}-{endIndex} von{" "}
            {pagination.total.toLocaleString("de-DE")} Kunden
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() =>
                updateParams({ page: Math.max(currentPage - 1, 1) })
              }
              disabled={currentPage === 1}
              className="px-3 py-1 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
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
                    className={`px-3 py-1 text-sm font-medium rounded-lg ${
                      currentPage === page
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

export default Kunden;
