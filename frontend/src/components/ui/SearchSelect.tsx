import { useState } from 'react';
import ReactSelect, { type StylesConfig, type SingleValue } from 'react-select';

export interface SearchSelectOption {
  /** Valor que se devuelve al onChange (string o número) */
  value: string | number;
  /** Texto visible y filtrable */
  label: string;
}

interface Opt {
  value: string;
  label: string;
}

interface Props {
  options       : SearchSelectOption[];
  value         : string | number | undefined;
  onChange      : (value: string, label: string) => void;
  placeholder?  : string;
  disabled?     : boolean;
  loading?      : boolean;
  noOptionsText?: string;
}

/**
 * Combobox con búsqueda en tiempo real.
 * - Funciona como input: el usuario escribe y filtra a medida que tipea.
 * - Conserva el comportamiento del dropdown clásico para hacer click.
 * - Filtrado por substring case-insensitive.
 * - Comparte estilo con BankSearchSelect (mismo "look & feel").
 */
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
  menuList       : (base) => ({ ...base, padding: '4px', maxHeight: '260px' }),
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

export function SearchSelect({
  options,
  value,
  onChange,
  placeholder   = 'Selecciona o escribe para buscar…',
  disabled,
  loading,
  noOptionsText = 'Sin resultados',
}: Props) {
  const [search, setSearch] = useState('');

  const allOpts: Opt[] = options.map((o) => ({
    value: String(o.value),
    label: o.label,
  }));

  const visibleOpts: Opt[] = search.trim()
    ? allOpts.filter((o) => o.label.toLowerCase().includes(search.trim().toLowerCase()))
    : allOpts;

  const valueStr = value === undefined || value === null ? '' : String(value);
  const selected = allOpts.find((o) => o.value === valueStr) ?? null;

  return (
    <ReactSelect<Opt, false>
      options={visibleOpts}
      filterOption={() => true}
      inputValue={search}
      onInputChange={(val, { action }) => {
        if (action === 'input-change') setSearch(val);
      }}
      value={selected}
      onChange={(opt: SingleValue<Opt>) => {
        onChange(opt?.value ?? '', opt?.label ?? '');
        setSearch('');
      }}
      onMenuClose={() => setSearch('')}
      placeholder={loading ? 'Cargando…' : placeholder}
      isDisabled={disabled || loading}
      isLoading={loading}
      isClearable
      isSearchable
      noOptionsMessage={() => noOptionsText}
      styles={styles}
      menuPortalTarget={typeof document !== 'undefined' ? document.body : undefined}
      menuPosition="fixed"
    />
  );
}
