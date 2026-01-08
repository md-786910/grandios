import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import { syncAPI } from "../services/api";

const Kunden = () => {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(20);
  const [sortBy, setSortBy] = useState("name");
  const [sortOrder, setSortOrder] = useState("asc");
  const [pagination, setPagination] = useState({
    total: 0,
    pages: 0,
  });

  // Debounce search term
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const response = await syncAPI.getCustomers(currentPage, itemsPerPage, debouncedSearch, sortBy, sortOrder);
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
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("asc");
    }
    setCurrentPage(1);
  };

  // Sort indicator component
  const SortIcon = ({ field }) => {
    if (sortBy !== field) {
      return (
        <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
        </svg>
      );
    }
    return sortOrder === "asc" ? (
      <svg className="w-4 h-4 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
      </svg>
    ) : (
      <svg className="w-4 h-4 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    );
  };

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  const formatCurrency = (value) => {
    return (value || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
              ? `${pagination.total.toLocaleString('de-DE')} Kunden insgesamt`
              : 'Kundenverwaltung'}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative">
            <input
              type="text"
              placeholder="Name, E-Mail, Kundennr. suchen..."
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
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <svg className="animate-spin h-8 w-8 text-gray-400" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
        ) : customers.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            Keine Kunden gefunden
          </div>
        ) : (
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
                <th
                  className="text-right px-6 py-4 text-sm font-semibold text-gray-900 cursor-pointer hover:bg-gray-50"
                  onClick={() => handleSort("wallet")}
                >
                  <div className="flex items-center justify-end gap-2">
                    Wallet
                    <SortIcon field="wallet" />
                  </div>
                </th>
                <th
                  className="text-right px-6 py-4 text-sm font-semibold text-gray-900 cursor-pointer hover:bg-gray-50"
                  onClick={() => handleSort("discountGranted")}
                >
                  <div className="flex items-center justify-end gap-2">
                    Rabatt Gewährt
                    <SortIcon field="discountGranted" />
                  </div>
                </th>
                <th
                  className="text-right px-6 py-4 text-sm font-semibold text-gray-900 cursor-pointer hover:bg-gray-50"
                  onClick={() => handleSort("discountRedeemed")}
                >
                  <div className="flex items-center justify-end gap-2">
                    Rabatt Eingelöst
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
                        {customer.name?.charAt(0) || "?"}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {customer.name}
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
                  <td className="px-6 py-4 text-sm text-right font-medium text-green-600">
                    € {formatCurrency(customer.wallet || 0)}
                  </td>
                  <td className="px-6 py-4 text-sm text-right text-gray-600">
                    € {formatCurrency(customer.totalDiscountGranted || 0)}
                  </td>
                  <td className="px-6 py-4 text-sm text-right text-gray-600">
                    € {formatCurrency(customer.totalDiscountRedeemed || 0)}
                  </td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => navigate(`/rabatt/${customer._id}`)}
                      className="text-sm text-gray-500 hover:text-gray-900 hover:underline"
                    >
                      Anzeigen
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between mt-4 px-2">
        <div className="text-sm text-gray-500">
          Zeige {pagination.total > 0 ? startIndex + 1 : 0}-{endIndex} von {pagination.total.toLocaleString('de-DE')} Kunden
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

export default Kunden;
