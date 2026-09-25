import { Text } from 'react-native';
import { Pantalla } from '../../src/componentes/Pantalla';
import { formatPrice } from '@oficio/shared';

export default function Inicio() {
  return <Pantalla titulo="Oficios Cuba"><Text>{formatPrice({ price_type: 'hourly', price_min: 5 })}</Text></Pantalla>;
}
