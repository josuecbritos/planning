import { Marca } from './Marca'

// Leyenda permanente sobre la grilla (4.3 / 7.2): maximo 5 elementos, en
// lenguaje llano.

export function Legend() {
  return (
    <div className="leyenda">
      <div className="leyenda__item"><Marca tipo="pendiente" /> Pendiente</div>
      <div className="leyenda__item"><Marca tipo="hecha" /> Hecha</div>
      <div className="leyenda__item"><Marca tipo="incumplida" /> Atrasado</div>
      <div className="leyenda__item"><Marca tipo="anterior" /> Fecha anterior</div>
      <div className="leyenda__item"><span className="mark mark--ambar" /> Replanificada en plazo (punto: ademas atrasada)</div>
    </div>
  )
}
