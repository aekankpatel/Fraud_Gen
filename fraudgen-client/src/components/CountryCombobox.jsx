import React, { useState, useEffect, useRef } from 'react';
import COUNTRIES from '../constants/countries';

function CountryCombobox({ value, onChange, id, required }) {
  const selected = COUNTRIES.find(c => c.code === value);
  const [query, setQuery] = useState(selected ? selected.name : '');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapperRef = useRef(null);
  const listRef = useRef(null);

  // Keep input in sync if `value` changes externally (e.g. sample loaded)
  useEffect(() => {
    const match = COUNTRIES.find(c => c.code === value);
    if (match) setQuery(prev => prev === match.name ? prev : match.name);
  }, [value]);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = query.trim() === ''
    ? COUNTRIES
    : COUNTRIES.filter(c =>
        c.name.toLowerCase().includes(query.toLowerCase()) ||
        c.code.toLowerCase().includes(query.toLowerCase())
      );

  const select = (country) => {
    onChange(country.code);
    setQuery(country.name);
    setOpen(false);
  };

  const handleKeyDown = (e) => {
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight(h => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight(h => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[highlight]) select(filtered[highlight]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div ref={wrapperRef} className="relative">
      <input
        id={id}
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setHighlight(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder="Type to search..."
        autoComplete="off"
        required={required}
        className="w-full p-2.5 border border-gray-300 rounded h-10 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      {open && (
        <ul
          ref={listRef}
          className="absolute z-20 left-0 right-0 mt-1 max-h-60 overflow-y-auto bg-white border border-gray-200 rounded shadow-lg"
        >
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-sm text-gray-500">No matches</li>
          ) : (
            filtered.map((c, i) => (
              <li
                key={c.code}
                onMouseDown={(e) => { e.preventDefault(); select(c); }}
                onMouseEnter={() => setHighlight(i)}
                className={`flex items-center justify-between px-3 py-2 text-sm cursor-pointer ${
                  i === highlight ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'
                } ${c.code === value ? 'font-semibold' : ''}`}
              >
                <span>{c.name}</span>
                <span className="text-xs text-gray-400">{c.code}</span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

export default CountryCombobox;
