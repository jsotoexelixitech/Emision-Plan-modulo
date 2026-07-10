import { useSessionTokenDelegation } from './hooks/useSessionTokenDelegation';
import { isFunerario } from './lib/product';
import RcvPlansApp from './apps/RcvPlansApp';
import FuneralPlansApp from './apps/FuneralPlansApp';

/**
 * Enrutador por producto — RCV y funerario en apps aisladas.
 * El flujo RCV no importa ni ejecuta lógica de cuestionario funerario.
 */
export default function App() {
  useSessionTokenDelegation();
  return isFunerario() ? <FuneralPlansApp /> : <RcvPlansApp />;
}
