import { Marca } from './Marca'

// Leyenda permanente sobre la grilla: mismas categorias, nombres y orden que
// el modelo de estados de la tabla (Hecha, Pendiente, Pendiente
// replanificada, Atrasada, Atrasada replanificada) + la marca de rastro.

export function Legend() {
  return (
    <div className="leyenda">
      <div className="leyenda__item"><Marca tipo="hecha" /> Hecha</div>
      <div className="leyenda__item"><Marca tipo="pendiente" /> Pendiente</div>
      <div className="leyenda__item"><span className="mark mark--ambar" /> Pendiente replanificada</div>
      <div className="leyenda__item"><Marca tipo="incumplida" /> Atrasada</div>
      <div className="leyenda__item"><Marca tipo="incumplida_replan" /> Atrasada replanificada</div>
      <div className="leyenda__item"><Marca tipo="anterior" /> Fecha anterior</div>
    </div>
  )
}
