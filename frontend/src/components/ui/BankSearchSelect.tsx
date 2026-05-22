import { useState } from 'react';
import ReactSelect, { type StylesConfig, type SingleValue } from 'react-select';

export interface BankOption {
  code : string;
  label: string;
}

interface Opt {
  value: string;
  label: string;
  code : string;
}

interface Props {
  options     : BankOption[];
  value       : string;
  onChange    : (code: string) => void;
  placeholder?: string;
  disabled?   : boolean;
}

const styles: StylesConfig<Opt, false> = {
  control: (base, state) => ({
    ...base,
    borderRadius   : '0.75rem',
    borderColor    : state.isFocused ? '#818cf8' : '#e2e8f0',
    boxShadow      : state.isFocused ? '0 0 0 4px rgba(99,102,241,0.1)' : 'none',
    backgroundColor: '#ffffff',
    minHeight      : '42px',
    cursor         : 'text',
    transition     : 'all 0.15s',
    '&:hover'      : { borderColor: state.isFocused ? '#818cf8' : '#cbd5e1' },
  }),
  valueContainer   : (base) => ({ ...base, padding: '2px 10px' }),
  singleValue      : (base) => ({ ...base, fontSize: '0.875rem', color: '#0f172a' }),
  placeholder      : (base) => ({ ...base, fontSize: '0.875rem', color: '#94a3b8' }),
  input            : (base) => ({ ...base, fontSize: '0.875rem', color: '#0f172a', margin: 0, padding: 0 }),
  indicatorSeparator: ()    => ({ display: 'none' }),
  dropdownIndicator: (base, state) => ({
    ...base,
    color    : '#94a3b8',
    padding  : '0 8px',
    transform: state.selectProps.menuIsOpen ? 'rotate(180deg)' : undefined,
    transition: 'transform 0.15s',
    '&:hover' : { color: '#64748b' },
  }),
  clearIndicator : (base) => ({ ...base, color: '#94a3b8', padding: '0 4px', '&:hover': { color: '#64748b' } }),
  menuPortal     : (base) => ({ ...base, zIndex: 9999 }),
  menu           : (base) => ({
    ...base,
    borderRadius: '0.75rem',
    border      : '1px solid #e2e8f0',
    boxShadow   : '0 10px 25px -5px rgba(0,0,0,0.12)',
    overflow    : 'hidden',
    marginTop   : '4px',
  }),
  menuList       : (base) => ({ ...base, padding: '4px', maxHeight: '240px' }),
  option         : (base, state) => ({
    ...base,
    borderRadius   : '0.5rem',
    fontSize       : '0.875rem',
    padding        : '8px 12px',
    backgroundColor: state.isSelected ? '#e0e7ff' : state.isFocused ? '#f8fafc' : 'transparent',
    color          : state.isSelected ? '#4338ca' : '#334155',
    fontWeight     : state.isSelected ? 600 : 400,
    cursor         : 'pointer',
    '&:active'     : { backgroundColor: '#e0e7ff' },
  }),
  noOptionsMessage: (base) => ({ ...base, fontSize: '0.875rem', color: '#94a3b8', fontStyle: 'italic' }),
};

export function BankSearchSelect({ options, value, onChange, placeholder = 'Selecciona o busca un banco…', disabled }: Props) {
  // ── El filtrado lo hacemos nosotros, no react-select ──────────────────────
  const [search, setSearch] = useState('');

  const allOpts: Opt[] = options.map(b => ({ value: b.code, label: b.label, code: b.code }));

  // Filtra por nombre O por código (solo si hay dígitos en la búsqueda)
  const visibleOpts: Opt[] = search.trim()
    ? allOpts.filter(o => {
        const q       = search.trim().toLowerCase();
        const onlyNum = search.replace(/\D/g, '');
        const matchByName = o.label.toLowerCase().includes(q);
        const matchByCode = onlyNum.length > 0 && o.code.includes(onlyNum);
        return matchByName || matchByCode;
      })
    : allOpts;

  const selected = allOpts.find(o => o.value === value) ?? null;

  return (
    <ReactSelect<Opt, false>
      // Pasamos solo las opciones ya filtradas
      options={visibleOpts}
      // Desactivamos el filtro interno de react-select (nosotros ya filtramos)
      filterOption={() => true}
      // Input controlado externamente
      inputValue={search}
      onInputChange={(val, { action }) => {
        if (action === 'input-change') setSearch(val);
      }}
      value={selected}
      onChange={(opt: SingleValue<Opt>) => {
        onChange(opt?.value ?? '');
        setSearch('');
      }}
      onMenuClose={() => setSearch('')}
      placeholder={placeholder}
      isDisabled={disabled}
      isClearable
      isSearchable
      noOptionsMessage={() => 'No se encontró ningún banco'}
      styles={styles}
      menuPortalTarget={typeof document !== 'undefined' ? document.body : undefined}
      menuPosition="fixed"
      formatOptionLabel={(opt, { context }) =>
        context === 'value' ? (
          <span style={{ fontSize: '0.875rem' }}>{opt.label}</span>
        ) : (
          <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontFamily: 'monospace', fontSize: '0.7rem', color: '#94a3b8', minWidth: '36px', flexShrink: 0 }}>
              {opt.code}
            </span>
            <span>{opt.label}</span>
          </span>
        )
      }
    />
  );
}
