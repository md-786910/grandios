import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Layout from "../components/Layout";

const customersData = {
  1: {
    id: 1,
    name: "Kunde 1",
    kundennummer: "Kundennummer_123",
    kundenname: "Jane Doe",
    email: "jane_doe@gmail.com",
    telefon: "+44 (0) 12345678",
    adresse: {
      strasse: "Robijnstraat 38",
      plz: "1234 RB Alkmaar",
      stadt: "Wien",
    },
    gesamtbestellwert: "738,50",
    gesamtrabattGewahrt: "155,00",
    orders: [
      {
        id: 1,
        bestellnummer: "GRAND52345",
        datum: "26-12-2024",
        gesamtNichtRabattiert: "249,80",
        rowSpan: 3,
        actionType: "tilgen",
        items: [
          { image: "https://images.unsplash.com/photo-1434389677669-e08b4cac3105?w=60&h=60&fit=crop" },
          { image: "https://images.unsplash.com/photo-1542272604-787c3835535d?w=60&h=60&fit=crop" },
          { image: "https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=60&h=60&fit=crop" },
          { image: "https://images.unsplash.com/photo-1620799140408-edc6dcb6d633?w=60&h=60&fit=crop" },
          { image: "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=60&h=60&fit=crop" },
        ],
      },
      {
        id: 2,
        bestellnummer: "GRAND09867",
        datum: "26-12-2024",
        gesamtNichtRabattiert: "149,90",
        skipAction: true,
        items: [
          { image: "https://images.unsplash.com/photo-1620799140408-edc6dcb6d633?w=60&h=60&fit=crop" },
          { image: "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=60&h=60&fit=crop" },
        ],
      },
      {
        id: 3,
        bestellnummer: "GRAND54637",
        datum: "26-12-2024",
        gesamtNichtRabattiert: "34,40",
        skipAction: true,
        items: [
          { image: "https://images.unsplash.com/photo-1434389677669-e08b4cac3105?w=60&h=60&fit=crop" },
          { image: "https://images.unsplash.com/photo-1542272604-787c3835535d?w=60&h=60&fit=crop" },
        ],
      },
      {
        id: 4,
        bestellnummer: "GRAND54637",
        datum: "26-12-2024",
        gesamtNichtRabattiert: "212,00",
        rowSpan: 3,
        actionType: "eingelost",
        items: [
          { image: "https://images.unsplash.com/photo-1434389677669-e08b4cac3105?w=60&h=60&fit=crop" },
          { image: "https://images.unsplash.com/photo-1542272604-787c3835535d?w=60&h=60&fit=crop" },
          { image: "https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=60&h=60&fit=crop" },
          { image: "https://images.unsplash.com/photo-1620799140408-edc6dcb6d633?w=60&h=60&fit=crop" },
          { image: "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=60&h=60&fit=crop" },
          { image: "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=60&h=60&fit=crop" },
          { image: "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=60&h=60&fit=crop" },
          { image: "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=60&h=60&fit=crop" },
          { image: "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=60&h=60&fit=crop" },
          { image: "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=60&h=60&fit=crop" },
        ],
      },
      {
        id: 5,
        bestellnummer: "GRAND54637",
        datum: "26-12-2024",
        gesamtNichtRabattiert: "192,40",
        skipAction: true,
        items: [
          { image: "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=60&h=60&fit=crop" },
          { image: "https://images.unsplash.com/photo-1620799140408-edc6dcb6d633?w=60&h=60&fit=crop" },
          { image: "https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=60&h=60&fit=crop" },
          { image: "https://images.unsplash.com/photo-1434389677669-e08b4cac3105?w=60&h=60&fit=crop" },
          { image: "https://images.unsplash.com/photo-1542272604-787c3835535d?w=60&h=60&fit=crop" },
          { image: "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=60&h=60&fit=crop" },
          { image: "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=60&h=60&fit=crop" },
          { image: "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=60&h=60&fit=crop" },
        ],
      },
      {
        id: 6,
        bestellnummer: "GRAND78901",
        datum: "26-12-2024",
        gesamtNichtRabattiert: "156,80",
        skipAction: true,
        items: [
          { image: "https://images.unsplash.com/photo-1434389677669-e08b4cac3105?w=60&h=60&fit=crop" },
          { image: "https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=60&h=60&fit=crop" },
          { image: "https://images.unsplash.com/photo-1620799140408-edc6dcb6d633?w=60&h=60&fit=crop" },
        ],
      },
    ],
  },
  2: {
    id: 2,
    name: "Kunde 2",
    kundennummer: "Kundennummer_456",
    kundenname: "John Smith",
    email: "john_smith@gmail.com",
    telefon: "+44 (0) 98765432",
    adresse: {
      strasse: "Hauptstrasse 12",
      plz: "5678 AB Amsterdam",
      stadt: "Amsterdam",
    },
    gesamtbestellwert: "520,30",
    gesamtrabattGewahrt: "85,00",
    orders: [],
  },
  3: {
    id: 3,
    name: "Kunde 3",
    kundennummer: "Kundennummer_789",
    kundenname: "Maria Schmidt",
    email: "maria_schmidt@gmail.com",
    telefon: "+44 (0) 55544433",
    adresse: {
      strasse: "Bergweg 5",
      plz: "9012 CD Berlin",
      stadt: "Berlin",
    },
    gesamtbestellwert: "890,00",
    gesamtrabattGewahrt: "120,00",
    orders: [],
  },
  4: {
    id: 4,
    name: "Kunde 4",
    kundennummer: "Kundennummer_101",
    kundenname: "Peter Müller",
    email: "peter_mueller@gmail.com",
    telefon: "+44 (0) 11122233",
    adresse: {
      strasse: "Talweg 8",
      plz: "3456 EF München",
      stadt: "München",
    },
    gesamtbestellwert: "650,80",
    gesamtrabattGewahrt: "95,00",
    orders: [],
  },
  5: {
    id: 5,
    name: "Kunde 5",
    kundennummer: "Kundennummer_202",
    kundenname: "Anna Weber",
    email: "anna_weber@gmail.com",
    telefon: "+44 (0) 44455566",
    adresse: {
      strasse: "Seestrasse 15",
      plz: "7890 GH Hamburg",
      stadt: "Hamburg",
    },
    gesamtbestellwert: "430,20",
    gesamtrabattGewahrt: "60,00",
    orders: [],
  },
  6: {
    id: 6,
    name: "Kunde 6",
    kundennummer: "Kundennummer_303",
    kundenname: "Thomas Fischer",
    email: "thomas_fischer@gmail.com",
    telefon: "+44 (0) 77788899",
    adresse: {
      strasse: "Waldweg 22",
      plz: "1234 IJ Frankfurt",
      stadt: "Frankfurt",
    },
    gesamtbestellwert: "780,60",
    gesamtrabattGewahrt: "110,00",
    orders: [],
  },
};

const RabattDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [notizen, setNotizen] = useState("");

  const customer = customersData[id];

  if (!customer) {
    return (
      <Layout>
        <div className="text-center py-12">
          <p className="text-gray-500">Kunde nicht gefunden</p>
          <button
            onClick={() => navigate("/rabatt")}
            className="mt-4 px-6 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
          >
            Zurück zur Liste
          </button>
        </div>
      </Layout>
    );
  }

  const totalOrders = customer.orders?.length || 6;
  const totalItems = customer.orders?.reduce((acc, order) => acc + order.items.length, 0) || 28;

  return (
    <Layout>
      {/* Header Buttons */}
      <div className="flex justify-end gap-2 mb-6">
        <button className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors text-sm">
          Bestellungen zusammenfassen
        </button>
        <button
          onClick={() => navigate("/rabatt")}
          className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors text-sm"
        >
          Zurück
        </button>
      </div>

      {/* Top Section */}
      <div className="flex gap-4 mb-4">
        {/* Kundendetails */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 w-[350px]">
          <h3 className="text-center font-semibold text-gray-900 mb-6">Kundendetails</h3>
          <div className="space-y-3 text-sm">
            <div className="flex">
              <span className="text-gray-500 w-32">Kundennummer:</span>
              <span className="text-gray-900">{customer.kundennummer}</span>
            </div>
            <div className="flex">
              <span className="text-gray-500 w-32">Kundenname:</span>
              <span className="text-gray-900">{customer.kundenname}</span>
            </div>
            <div className="flex">
              <span className="text-gray-500 w-32">E-Mail:</span>
              <span className="text-gray-900">{customer.email}</span>
            </div>
            <div className="flex">
              <span className="text-gray-500 w-32">Telefonnummer:</span>
              <span className="text-gray-900">{customer.telefon}</span>
            </div>
            <div className="flex">
              <span className="text-gray-500 w-32">Adresse:</span>
              <div className="text-gray-900">
                <div>{customer.adresse.strasse}</div>
                <div>{customer.adresse.plz}</div>
                <div>{customer.adresse.stadt}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Middle Stats */}
        <div className="flex flex-col gap-4">
          {/* Gesamtbestellwert */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 flex flex-col items-center justify-center min-w-[220px]">
            <h3 className="font-semibold text-green-600 mb-2 text-sm">Gesamtbestellwert</h3>
            <p className="text-3xl font-bold text-gray-900">€ {customer.gesamtbestellwert}</p>
          </div>

          {/* Gesamtrabatt Gewährt */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 flex flex-col items-center justify-center">
            <h3 className="font-semibold text-gray-600 mb-2 text-sm">Gesamtrabatt Gewährt</h3>
            <p className="text-3xl font-bold text-gray-900">€ {customer.gesamtrabattGewahrt}</p>
          </div>
        </div>

        {/* Notizen */}
        <div className="flex-1 bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Notizen Hinzufügen</h3>
          <textarea
            value={notizen}
            onChange={(e) => setNotizen(e.target.value)}
            className="w-full h-32 border border-gray-200 rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-gray-200"
            placeholder=""
          />
          <div className="flex justify-end mt-3">
            <button className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors text-sm">
              Speichern
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Stats Row */}
      <div className="flex gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6 flex flex-col items-center justify-center w-[350px]">
          <h3 className="font-semibold text-gray-600 mb-2 text-sm">Anzahl Der Bestellungen</h3>
          <p className="text-3xl font-bold text-gray-900">{totalOrders}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6 flex flex-col items-center justify-center min-w-[220px]">
          <h3 className="font-semibold text-gray-600 mb-2 text-sm">Anzahl Der Artikel</h3>
          <p className="text-3xl font-bold text-gray-900">{totalItems}</p>
        </div>
      </div>

      {/* Orders List with Rabatt Summary - Table Layout */}
      {customer.orders?.length > 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full">
            <tbody>
              {customer.orders.map((order, index) => {
                // Determine if this row should have a rowSpan button
                const showTilgen = order.rowSpan && order.actionType === "tilgen";
                const showEingelost = order.rowSpan && order.actionType === "eingelost";
                const hasAction = order.rowSpan;

                return (
                  <tr
                    key={order.id}
                    className={index !== customer.orders.length - 1 ? "border-b border-gray-100" : ""}
                  >
                    {/* Order Info */}
                    <td className="p-5 w-[420px]">
                      <p className="text-sm text-gray-900">
                        <span className="font-semibold">Bestellnummer</span> - {order.bestellnummer} |{" "}
                        <span className="font-semibold">Bestelldatum</span> - {order.datum}
                      </p>
                      <p className="text-sm text-gray-600 mt-1">
                        <span className="font-semibold">Gesamtbestellwert Nicht Rabattierter Artikel:</span> €{" "}
                        {order.gesamtNichtRabattiert}
                      </p>
                    </td>

                    {/* Product Images */}
                    <td className="p-5">
                      <div className="flex items-center gap-3">
                        {order.items.slice(0, 5).map((item, idx) => (
                          <img
                            key={idx}
                            src={item.image}
                            alt=""
                            className="w-16 h-16 object-cover rounded-lg border border-gray-200"
                          />
                        ))}
                        {order.items.length > 5 && (
                          <span className="text-gray-600 text-xl font-medium ml-1">+{order.items.length - 5}</span>
                        )}
                      </div>
                    </td>

                    {/* Action Column with rowSpan */}
                    {showTilgen && (
                      <td rowSpan={order.rowSpan} className="p-5 w-[180px] text-center align-middle border-l border-gray-100">
                        <div className="flex flex-col items-center">
                          <p className="text-2xl font-bold text-gray-900">€ 30,00</p>
                          <p className="text-sm text-gray-500 mt-1">Rabatt Ist Verfügbar</p>
                          <button
                            onClick={() => navigate(`/rabatt/${id}/tilgen`)}
                            className="mt-4 px-8 py-2 border border-green-500 text-green-500 rounded-lg text-sm hover:bg-green-50 transition-colors font-medium"
                          >
                            Tilgen
                          </button>
                        </div>
                      </td>
                    )}
                    {showEingelost && (
                      <td rowSpan={order.rowSpan} className="p-5 w-[150px] text-center align-middle border-l border-gray-100">
                        <button className="px-6 py-2 bg-gray-400 text-white rounded-lg text-sm font-medium">
                          Eingelöst
                        </button>
                      </td>
                    )}
                    {!hasAction && !order.skipAction && (
                      <td className="p-5 w-[150px] border-l border-gray-100"></td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500">
          Keine Bestellungen vorhanden
        </div>
      )}
    </Layout>
  );
};

export default RabattDetail;
