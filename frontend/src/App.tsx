import { useSessionTokenDelegation } from './hooks/useSessionTokenDelegation';
import { isFunerario } from './lib/product';
import { isExelixiCatalogFlow } from './lib/exelixi-catalog';
import RcvPlansApp from './apps/RcvPlansApp';
import FuneralPlansApp from './apps/FuneralPlansApp';
import ExelixiCatalogPlansApp from './apps/ExelixiCatalogPlansApp';

/**
 * Enrutador por producto — RCV, funerario y catálogo Exélixi en apps aisladas.
 * El flujo La Mundial no importa lógica del catálogo Exélixi.
 */
export default function App() {
  useSessionTokenDelegation();
  if (isExelixiCatalogFlow()) return <ExelixiCatalogPlansApp />;
  return isFunerario() ? <FuneralPlansApp /> : <RcvPlansApp />;
}
