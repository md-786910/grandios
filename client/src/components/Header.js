import React from 'react';

const Header = () => {
  return (
    <header className="fixed top-0 left-64 right-0 h-16 bg-white border-b border-gray-200 flex items-center justify-end px-6 z-40">
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
