import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { discountsAPI, ordersAPI } from "../services/api";
import { sanitizeName } from "../utils/helpers";
import menuItems from "./menuItems";

const Header = () => {
  const location = useLocation();
  const [rabattCustomerName, setRabattCustomerName] = useState("");
  const [orderInfo, setOrderInfo] = useState({ number: "", customer: "" });

  const rabattMatch = location.pathname.match(/^\/rabatt\/([^/]+)(?:\/tilgen)?$/);
  const rabattId = rabattMatch?.[1];
  const orderMatch = location.pathname.match(/^\/bestellungen\/([^/]+)$/);
  const orderId = orderMatch?.[1];
  const isRabattTilgen = /^\/rabatt\/[^/]+\/tilgen$/.test(location.pathname);
  const isRabattDetail = /^\/rabatt\/[^/]+$/.test(location.pathname);
  const isOrderDetail = /^\/bestellungen\/[^/]+$/.test(location.pathname);
  const activeItem = menuItems.find(
    (item) =>
      location.pathname === item.path ||
      location.pathname.startsWith(item.path + "/")
  );

  useEffect(() => {
    let isActive = true;

    if (!rabattId) {
      setRabattCustomerName("");
      return () => {
        isActive = false;
      };
    }

    const stateName = location.state?.customerName;
    if (stateName) {
      setRabattCustomerName(stateName);
      return () => {
        isActive = false;
      };
    }

    const fetchCustomerName = async () => {
      try {
        const response = await discountsAPI.getCustomerDiscount(rabattId);
        if (!isActive) return;
        if (response.data?.success) {
          const customer = response.data?.data?.customer || {};
          const name = customer.customerName || customer.name || "";
          setRabattCustomerName(name);
        }
      } catch (error) {
        if (isActive) {
          setRabattCustomerName("");
        }
      }
    };

    fetchCustomerName();
    return () => {
      isActive = false;
    };
  }, [location.state, rabattId]);

  useEffect(() => {
    let isActive = true;

    if (!orderId) {
      setOrderInfo({ number: "", customer: "" });
      return () => {
        isActive = false;
      };
    }

    const stateOrderNumber = location.state?.orderNumber || "";
    const stateCustomerName = location.state?.customerName || "";
    if (stateOrderNumber || stateCustomerName) {
      setOrderInfo({ number: stateOrderNumber, customer: stateCustomerName });
      return () => {
        isActive = false;
      };
    }

    const fetchOrderInfo = async () => {
      try {
        const response = await ordersAPI.getById(orderId);
        if (!isActive) return;
        if (response.data?.success) {
          const order = response.data?.data || {};
          const number = order.posReference || "";
          const customerName = order.customerId?.name || "";
          setOrderInfo({ number, customer: customerName });
        }
      } catch (error) {
        if (isActive) {
          setOrderInfo({ number: "", customer: "" });
        }
      }
    };

    fetchOrderInfo();
    return () => {
      isActive = false;
    };
  }, [location.state, orderId]);

  const safeCustomerName = rabattCustomerName
    ? sanitizeName(rabattCustomerName)
    : "";
  const safeOrderCustomer = orderInfo.customer
    ? sanitizeName(orderInfo.customer)
    : "";
  const headerTitle = isRabattTilgen
    ? "Rabatt Tilgen"
    : isRabattDetail
    ? "Rabatt Details"
    : isOrderDetail
    ? "Bestellung Details"
    : activeItem?.label || "Verwaltung";
  const headerSubtitle = isRabattTilgen || isRabattDetail
    ? safeCustomerName
    : isOrderDetail
    ? [orderInfo.number, safeOrderCustomer].filter(Boolean).join(" • ")
    : "";

  return (
    <header className="fixed top-0 left-64 right-0 h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 z-40">
      <div className="flex flex-col leading-tight">
        <h2 className="text-lg font-semibold text-gray-800">{headerTitle}</h2>
        {headerSubtitle ? (
          <span className="text-xs text-gray-500">{headerSubtitle}</span>
        ) : null}
      </div>
      <div className="flex items-center gap-3">
        <span className="text-gray-700 font-medium">Verwaltung</span>
        <div className="w-10 h-10 rounded-full bg-gray-200 overflow-hidden">
          <img
            src="https://ui-avatars.com/api/?name=Admin&background=random"
            alt="Admin"
            className="w-full h-full object-cover"
          />
        </div>
      </div>
    </header>
  );
};

export default Header;
